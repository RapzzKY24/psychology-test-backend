import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INVOICES_REPOSITORY } from '../repository/invoices.repository';
import type { InvoicesRepository } from '../repository/invoices.repository';
import type { Invoice, Prisma } from '../../../generated/prisma/client';
import { IdempotencyService } from '../../idempotency/service/idempotency.service';
import { EventLogService } from '../../event-log/service/event-log.service';
import { JokulApiError } from '../../jokul/errors/jokul-api.error';
import { DEFAULT_VA_BANK_CODE } from '../../jokul/constants/jokul';
import {
  PAYMENT_GATEWAY,
  type CreatePaymentResult,
  type PaymentGateway,
} from '../../payments/gateway/payment-gateway.interface';

// Distinct namespace from orders so VA idempotency keys never collide.
const VA_CREATE_SCOPE = 'jokul.invoice.va.create';
// Separate scope so an amount change re-issues instead of replaying the cached VA.
const VA_REPROVISION_SCOPE = 'jokul.invoice.va.reprovision';

@Injectable()
export class InvoiceVaService {
  constructor(
    @Inject(INVOICES_REPOSITORY)
    private readonly repo: InvoicesRepository,
    private readonly idempotency: IdempotencyService,
    private readonly eventLog: EventLogService,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
    private readonly config: ConfigService,
  ) {}

  /** The VA provider is usable when Jokul is selected or the dev stub is on. */
  isEnabled(): boolean {
    return (
      this.config.get<boolean>('app.jokul.stub') === true ||
      this.config.get<string>('app.paymentProvider') === 'jokul'
    );
  }

  /** Idempotently provision a VA for a session-linked invoice. */
  async provision(invoiceId: string, name: string): Promise<Invoice | null> {
    const invoice = await this.repo.findById(invoiceId);
    if (!invoice) return null;
    if (invoice.vaNumber) return invoice;

    return this.issueVa(invoice, name, VA_CREATE_SCOPE, invoice.id);
  }

  /**
   * Re-issue the VA for a still-UNPAID invoice whose amount changed (roster
   * edit). The old VA number stops resolving, so a late callback for the stale
   * total is rejected as `payment_not_found` instead of mis-activating the
   * session on an `amount_mismatch`.
   */
  async reprovision(invoiceId: string, name: string): Promise<Invoice | null> {
    const invoice = await this.repo.findById(invoiceId);
    if (!invoice || invoice.status !== 'UNPAID') return invoice;

    return this.issueVa(
      invoice,
      name,
      VA_REPROVISION_SCOPE,
      `${invoice.id}:${invoice.amount}`,
    );
  }

  /** Poll the provider for this VA's settlement status (reconciliation). */
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

  private async issueVa(
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
      source: 'JOKUL',
      direction: 'OUTBOUND',
      type: 'CREATE_VA_REQUEST',
      aggregateType: 'Invoice',
      aggregateId: invoice.id,
      reference: externalId,
      payload: {
        trxId: externalId,
        virtualAccountName: name,
        totalAmount: { value: invoice.amount.toFixed(2), currency: 'IDR' },
        bankCode: DEFAULT_VA_BANK_CODE,
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
      if (error instanceof JokulApiError) {
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

  private get paymentTtlMin(): number {
    return this.config.get<number>('app.paymentTtlMin', 60);
  }

  private toColumns(result: CreatePaymentResult): Prisma.InvoiceUpdateInput {
    if (!result.vaNumber) {
      throw new BadGatewayException('payment_gateway_failed');
    }
    return {
      vaNumber: result.vaNumber,
      vaBankCode: result.bankCode ?? DEFAULT_VA_BANK_CODE,
      paymentProvider: 'JOKUL_VA',
    };
  }
}
