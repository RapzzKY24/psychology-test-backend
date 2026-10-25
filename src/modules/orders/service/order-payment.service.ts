import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ORDERS_REPOSITORY } from '../repository/orders.repository';
import type { OrdersRepository } from '../repository/orders.repository';
import type {
  EventSource,
  Order,
  PaymentProvider,
} from '../../../generated/prisma/client';
import { IdempotencyService } from '../../idempotency/service/idempotency.service';
import { EventLogService } from '../../event-log/service/event-log.service';
import { PaymentGatewayError } from '../../payments/gateway/payment-gateway.error';
import {
  PAYMENT_GATEWAY,
  type CreatePaymentResult,
  type PaymentGateway,
} from '../../payments/gateway/payment-gateway.interface';
import {
  PAYMENT_PROVIDER_ENV_TO_DB,
  type PaymentProviderEnv,
} from '../../../common/constants/payment-provider';
import { VA_UNIQUE_CODE } from '../constants/payment';

/** Columns written back after a provider-side payment has been created. */
interface PaymentProvisionFields {
  providerOrderId: string;
  paymentToken: string | null;
  paymentUrl: string | null;
  vaNumber: string | null;
  vaBankCode: string | null;
}

@Injectable()
export class OrderPaymentService {
  constructor(
    @Inject(ORDERS_REPOSITORY)
    private readonly repo: OrdersRepository,
    private readonly idempotency: IdempotencyService,
    private readonly eventLog: EventLogService,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
    private readonly config: ConfigService,
  ) {}

  /** The gateway is usable whenever a provider is selected (anything but manual). */
  isEnabled(): boolean {
    return this.providerEnv !== 'manual';
  }

  /** Create a pending order (no unique code) and provision its payment. */
  async createPaymentOrder(
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
      paymentProvider: this.paymentProvider,
      expiresAt: new Date(Date.now() + this.paymentTtlMin * 60 * 1000),
    });

    const payment = await this.provision(order, virtualAccountName);
    return this.repo.update(order.id, payment);
  }

  /**
   * Retry provisioning for a gateway order that has no provider order yet.
   * Reuses `order.id` as the external id, so the provider/idempotency layer
   * dedupes a retry.
   */
  async reprovision(orderId: string): Promise<Order | null> {
    const order = await this.repo.findById(orderId);
    if (!order || order.providerOrderId || order.vaNumber) return order;
    const test = await this.repo.findTestById(order.testId);
    const payment = await this.provision(
      order,
      test?.name ?? `Order ${order.id}`,
    );
    return this.repo.update(order.id, payment);
  }

  /** Poll the provider for this payment's settlement status (reconciliation). */
  async inquiryVa(params: {
    vaNumber: string;
    paymentRequestId?: string;
    externalId?: string;
  }): Promise<{ vaNumber: string; status: string; paidAmount: number | null }> {
    const result = await this.gateway.getStatus({
      providerOrderId: params.externalId ?? params.vaNumber,
      vaNumber: params.vaNumber,
    });
    return {
      vaNumber: params.vaNumber,
      status: result.status === 'PAID' ? '00' : 'PENDING',
      paidAmount: result.paidAmount,
    };
  }

  private get paymentTtlMin(): number {
    return this.config.get<number>('app.paymentTtlMin', 60);
  }

  /**
   * Normalises the env value. An unknown or non-string value falls back to
   * `jokul` instead of leaking into idempotency scopes and DB columns.
   */
  private get providerEnv(): PaymentProviderEnv {
    const raw = this.config.get<string>('app.paymentProvider');
    return raw === 'manual' || raw === 'midtrans' || raw === 'jokul'
      ? raw
      : 'jokul';
  }

  private get paymentProvider(): PaymentProvider {
    return PAYMENT_PROVIDER_ENV_TO_DB[this.providerEnv] ?? 'JOKUL_VA';
  }

  /** Audit rows must name the provider that actually served the request. */
  private get eventSource(): EventSource {
    return this.providerEnv === 'midtrans' ? 'MIDTRANS' : 'JOKUL';
  }

  /**
   * The scope carries the active provider: a Midtrans retry on the same
   * external id must never replay a Jokul result cached under another provider.
   */
  private createScope(): string {
    return `${this.providerEnv}.payment.create`;
  }

  private async provision(
    order: Order,
    virtualAccountName: string,
  ): Promise<PaymentProvisionFields> {
    const externalId = order.id;
    const claim = await this.idempotency.begin({
      scope: this.createScope(),
      key: externalId,
    });

    if (
      !claim.acquired &&
      claim.existing.status === 'COMPLETED' &&
      claim.existing.responseBody !== null
    ) {
      return this.toPaymentColumns(
        claim.existing.responseBody as unknown as CreatePaymentResult,
      );
    }
    const claimId = claim.acquired ? claim.id : claim.existing.id;

    const event = await this.eventLog.record({
      source: this.eventSource,
      direction: 'OUTBOUND',
      type: 'CREATE_PAYMENT_REQUEST',
      aggregateType: 'Order',
      aggregateId: order.id,
      reference: externalId,
      payload: {
        providerOrderId: externalId,
        amount: order.amount,
        expiresAt: order.expiresAt,
        customerName: virtualAccountName,
      },
    });

    let result: CreatePaymentResult;
    try {
      result = await this.gateway.createPayment({
        externalId,
        amount: order.amount,
        expiresAt: order.expiresAt,
        customer: { name: virtualAccountName },
      });
    } catch (error) {
      await this.idempotency.fail(claimId, {
        errorMessage: error instanceof Error ? error.message : 'unknown_error',
      });
      if (error instanceof PaymentGatewayError) {
        throw new BadGatewayException('payment_gateway_failed');
      }
      throw error;
    }

    await this.eventLog.markProcessed(event.id, { response: result });
    await this.idempotency.complete(claimId, {
      responseStatus: 200,
      responseBody: result,
    });
    return this.toPaymentColumns(result);
  }

  /**
   * Snap returns a token and a redirect url but no VA number, so the VA columns
   * stay null there; Jokul fills them instead.
   */
  private toPaymentColumns(
    result: CreatePaymentResult,
  ): PaymentProvisionFields {
    return {
      providerOrderId: result.providerOrderId,
      paymentToken: result.token || null,
      paymentUrl: result.redirectUrl || null,
      vaNumber: result.vaNumber ?? null,
      vaBankCode: result.bankCode ?? null,
    };
  }
}
