import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ORDERS_REPOSITORY } from '../repository/orders.repository';
import type { OrdersRepository } from '../repository/orders.repository';
import type { Order } from '../../../generated/prisma/client';
import { IdempotencyService } from '../../idempotency/service/idempotency.service';
import { EventLogService } from '../../event-log/service/event-log.service';
import { DokuApiError } from '../../doku/errors/doku-api.error';
import { DEFAULT_VA_BANK_CODE } from '../../doku/constants/doku';
import {
  PAYMENT_GATEWAY,
  type CreateVaResult,
  type PaymentGateway,
  type VaInquiryParams,
  type VaInquiryResult,
} from '../../doku/gateway/payment-gateway.interface';
import { VA_UNIQUE_CODE } from '../constants/payment';

const VA_CREATE_SCOPE = 'doku.va.create';

interface VaProvisionFields {
  vaNumber: string;
  vaBankCode: string;
  gdcTrxId: string;
  gdcReferenceNo: string | null;
  gdcExternalId: string;
}

@Injectable()
export class OrderVaService {
  constructor(
    @Inject(ORDERS_REPOSITORY)
    private readonly repo: OrdersRepository,
    private readonly idempotency: IdempotencyService,
    private readonly eventLog: EventLogService,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
    private readonly config: ConfigService,
  ) {}

  /** The VA provider is usable when DOKU is selected or the dev stub is on. */
  isEnabled(): boolean {
    return (
      this.config.get<boolean>('app.doku.stub') === true ||
      this.config.get<string>('app.paymentProvider') === 'doku'
    );
  }

  /** Create a VA order (no unique code) and provision its Virtual Account. */
  async createVaOrder(
    testId: string,
    userId: string,
    basePrice: number,
    virtualAccountName: string,
  ): Promise<Order> {
    const order = await this.repo.create({
      userId,
      test: { connect: { id: testId } },
      basePrice,
      uniqueCode: VA_UNIQUE_CODE,
      amount: basePrice,
      status: 'PENDING',
      paymentProvider: 'DOKU_VA',
      expiresAt: new Date(Date.now() + this.paymentTtlMin * 60 * 1000),
    });

    const va = await this.provision(order, virtualAccountName);
    return this.repo.update(order.id, va);
  }

  /**
   * Retry provisioning for a gateway order that has no VA yet. Reuses
   * `order.id` as the external id, so DOKU/idempotency dedupes a retry.
   */
  async reprovision(orderId: string): Promise<Order | null> {
    const order = await this.repo.findById(orderId);
    if (!order || order.vaNumber) return order;
    const test = await this.repo.findTestById(order.testId);
    const va = await this.provision(order, test?.name ?? `Order ${order.id}`);
    return this.repo.update(order.id, va);
  }

  /** Poll the provider for this VA's settlement status (reconciliation). */
  inquiryVa(params: VaInquiryParams): Promise<VaInquiryResult> {
    return this.gateway.inquiryVa(params);
  }

  private get paymentTtlMin(): number {
    return this.config.get<number>('app.paymentTtlMin', 60);
  }

  private async provision(
    order: Order,
    virtualAccountName: string,
  ): Promise<VaProvisionFields> {
    const externalId = order.id;
    const claim = await this.idempotency.begin({
      scope: VA_CREATE_SCOPE,
      key: externalId,
    });

    if (
      !claim.acquired &&
      claim.existing.status === 'COMPLETED' &&
      claim.existing.responseBody !== null
    ) {
      return this.toVaColumns(
        externalId,
        claim.existing.responseBody as unknown as CreateVaResult,
      );
    }
    const claimId = claim.acquired ? claim.id : claim.existing.id;

    const event = await this.eventLog.record({
      source: 'DOKU',
      direction: 'OUTBOUND',
      type: 'CREATE_VA_REQUEST',
      aggregateType: 'Order',
      aggregateId: order.id,
      reference: externalId,
      payload: {
        trxId: order.id,
        virtualAccountName,
        totalAmount: { value: order.amount.toFixed(2), currency: 'IDR' },
        bankCode: DEFAULT_VA_BANK_CODE,
      },
    });

    let result: CreateVaResult;
    try {
      result = await this.gateway.createVa({
        externalId,
        amount: order.amount,
        name: virtualAccountName,
        expiresAt: order.expiresAt,
      });
    } catch (error) {
      await this.idempotency.fail(claimId, {
        errorMessage: error instanceof Error ? error.message : 'unknown_error',
      });
      if (error instanceof DokuApiError) {
        throw new BadGatewayException('payment_gateway_failed');
      }
      throw error;
    }

    await this.eventLog.markProcessed(event.id, { response: result });
    await this.idempotency.complete(claimId, {
      responseStatus: 200,
      responseBody: result,
    });
    return this.toVaColumns(externalId, result);
  }

  private toVaColumns(
    externalId: string,
    result: CreateVaResult,
  ): VaProvisionFields {
    return {
      vaNumber: result.vaNumber,
      vaBankCode: result.bankCode,
      gdcTrxId: result.trxId,
      gdcReferenceNo: result.referenceNo,
      gdcExternalId: externalId,
    };
  }
}
