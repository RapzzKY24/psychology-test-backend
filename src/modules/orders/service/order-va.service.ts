import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ORDERS_REPOSITORY } from '../repository/orders.repository';
import type { OrdersRepository } from '../repository/orders.repository';
import type { Order } from '../../../generated/prisma/client';
import { IdempotencyService } from '../../idempotency/service/idempotency.service';
import { EventLogService } from '../../event-log/service/event-log.service';
import { GdcClient } from '../../gdc/client/gdc.client';
import type { CreateVirtualAccountResult } from '../../gdc/client/gdc.client';
import { GdcApiError } from '../../gdc/errors/gdc-api.error';
import { isoTimestamp } from '../../gdc/utils/timestamp';
import {
  DEFAULT_VA_BANK_CODE,
  VA_TRX_TYPE,
  VA_UNIQUE_CODE,
} from '../constants/payment';

const VA_CREATE_SCOPE = 'gdc.va.create';

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
    private readonly gdc: GdcClient,
    private readonly config: ConfigService,
  ) {}

  isEnabled(): boolean {
    return this.config.get<string>('app.paymentProvider') === 'gdc';
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
      paymentProvider: 'GDC_VA',
      expiresAt: new Date(Date.now() + this.paymentTtlMin * 60 * 1000),
    });

    const va = await this.provision(order, virtualAccountName);
    return this.repo.update(order.id, va);
  }

  /**
   * Retry provisioning for a gateway order that has no VA yet. Reuses
   * `order.id` as the external id, so GDC/idempotency dedupes a retry.
   */
  async reprovision(orderId: string): Promise<Order | null> {
    const order = await this.repo.findById(orderId);
    if (!order || order.vaNumber) return order;
    const test = await this.repo.findTestById(order.testId);
    const va = await this.provision(order, test?.name ?? `Order ${order.id}`);
    return this.repo.update(order.id, va);
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
        claim.existing.responseBody as unknown as CreateVirtualAccountResult,
      );
    }
    const claimId = claim.acquired ? claim.id : claim.existing.id;

    const event = await this.eventLog.record({
      source: 'GDC',
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

    let result: CreateVirtualAccountResult;
    try {
      result = await this.gdc.createVirtualAccount(
        {
          virtualAccountName,
          expiredDate: isoTimestamp(order.expiresAt),
          trxId: order.id,
          virtualAccountTrxType: VA_TRX_TYPE,
          totalAmount: { value: order.amount.toFixed(2), currency: 'IDR' },
          accountNumber: this.config.get<string>('app.gdc.accountNumber', ''),
          bankCode: DEFAULT_VA_BANK_CODE,
        },
        externalId,
      );
    } catch (error) {
      await this.idempotency.fail(claimId, {
        errorMessage: error instanceof Error ? error.message : 'unknown_error',
      });
      if (error instanceof GdcApiError) {
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
    result: CreateVirtualAccountResult,
  ): VaProvisionFields {
    return {
      vaNumber: result.virtualAccountNo,
      vaBankCode: DEFAULT_VA_BANK_CODE,
      gdcTrxId: result.trxId,
      gdcReferenceNo: result.referenceNo,
      gdcExternalId: externalId,
    };
  }
}
