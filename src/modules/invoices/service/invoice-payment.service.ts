import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INVOICES_REPOSITORY } from '../repository/invoices.repository';
import type { InvoicesRepository } from '../repository/invoices.repository';
import type {
  EventSource,
  Invoice,
  PaymentProvider,
  Prisma,
} from '../../../generated/prisma/client';
import { IdempotencyService } from '../../idempotency/service/idempotency.service';
import { EventLogService } from '../../event-log/service/event-log.service';
import { PaymentGatewayError } from '../../payments/gateway/payment-gateway.error';
import {
  PAYMENT_GATEWAY,
  type CreatePaymentResult,
  type PaymentGateway,
  type PaymentStatusResult,
} from '../../payments/gateway/payment-gateway.interface';
import {
  PAYMENT_PROVIDER_ENV_TO_DB,
  type PaymentProviderEnv,
} from '../../../common/constants/payment-provider';

@Injectable()
export class InvoicePaymentService {
  constructor(
    @Inject(INVOICES_REPOSITORY)
    private readonly repo: InvoicesRepository,
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

  /** Idempotently provision a payment for a session-linked invoice. */
  async provision(invoiceId: string, name: string): Promise<Invoice | null> {
    const invoice = await this.repo.findById(invoiceId);
    if (!invoice) return null;
    if (invoice.providerOrderId || invoice.vaNumber) return invoice;

    return this.issuePayment(invoice, name, this.createScope(), invoice.id);
  }

  /**
   * Re-issue the payment for a still-UNPAID invoice whose amount changed
   * (roster edit). The old provider order stops resolving, so a late
   * notification for the stale total is rejected as `payment_not_found`
   * instead of mis-activating the session on an `amount_mismatch`.
   */
  async reprovision(invoiceId: string, name: string): Promise<Invoice | null> {
    const invoice = await this.repo.findById(invoiceId);
    if (!invoice || invoice.status !== 'UNPAID') return invoice;

    return this.issuePayment(
      invoice,
      name,
      this.reprovisionScope(),
      // Midtrans order ids only allow alphanumerics and `- _ ~ .`, so the
      // amount is joined with a hyphen and never a colon.
      `${invoice.id}-${invoice.amount}`,
    );
  }

  /** Poll the provider for this payment's settlement status (reconciliation). */
  async getStatus(params: {
    providerOrderId: string;
  }): Promise<PaymentStatusResult> {
    return this.gateway.getStatus(params);
  }

  private get paymentTtlMin(): number {
    return this.config.get<number>('app.paymentTtlMin', 60);
  }

  /**
   * Normalises the env value. An unknown or non-string value falls back to
   * `midtrans` (the only gateway left) instead of leaking into idempotency
   * scopes and DB columns.
   */
  private get providerEnv(): PaymentProviderEnv {
    return this.config.get<string>('app.paymentProvider') === 'manual'
      ? 'manual'
      : 'midtrans';
  }

  private get paymentProvider(): PaymentProvider {
    return PAYMENT_PROVIDER_ENV_TO_DB[this.providerEnv];
  }

  /** Audit rows must name the provider that actually served the request. */
  private get eventSource(): EventSource {
    return 'MIDTRANS';
  }

  /** Distinct namespace from orders, provider-scoped like every create scope. */
  private createScope(): string {
    return `${this.providerEnv}.invoice.payment.create`;
  }

  /** Separate scope so an amount change re-issues instead of replaying the cache. */
  private reprovisionScope(): string {
    return `${this.providerEnv}.invoice.payment.reprovision`;
  }

  private async issuePayment(
    invoice: Invoice,
    name: string,
    scope: string,
    externalId: string,
  ): Promise<Invoice> {
    const claim = await this.idempotency.begin({ scope, key: externalId });
    if (
      !claim.acquired &&
      claim.existing.status === 'COMPLETED' &&
      claim.existing.responseBody !== null
    ) {
      return this.repo.update(
        invoice.id,
        this.toColumns(
          claim.existing.responseBody as unknown as CreatePaymentResult,
        ),
      );
    }
    const claimId = claim.acquired ? claim.id : claim.existing.id;

    const event = await this.eventLog.record({
      source: this.eventSource,
      direction: 'OUTBOUND',
      type: 'CREATE_PAYMENT_REQUEST',
      aggregateType: 'Invoice',
      aggregateId: invoice.id,
      reference: externalId,
      payload: {
        providerOrderId: externalId,
        amount: invoice.amount,
        expiresAt: invoice.expiresAt,
        customerName: name,
      },
    });

    let result: CreatePaymentResult;
    try {
      result = await this.gateway.createPayment({
        externalId,
        amount: invoice.amount,
        expiresAt:
          invoice.expiresAt ??
          new Date(Date.now() + this.paymentTtlMin * 60 * 1000),
        customer: { name },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'unknown_error';
      await this.eventLog.markFailed(event.id, { errorMessage });
      await this.idempotency.fail(claimId, { errorMessage });
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
    return this.repo.update(invoice.id, this.toColumns(result));
  }

  /**
   * Snap returns a token and a redirect url but no VA number, so the legacy
   * VA columns stay null on every new payment.
   */
  private toColumns(result: CreatePaymentResult): Prisma.InvoiceUpdateInput {
    return {
      providerOrderId: result.providerOrderId,
      paymentToken: result.token || null,
      paymentUrl: result.redirectUrl || null,
      paymentProvider: this.paymentProvider,
      vaNumber: null,
      vaBankCode: null,
    };
  }
}
