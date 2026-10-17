import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INVOICES_REPOSITORY } from '../repository/invoices.repository';
import type { InvoicesRepository } from '../repository/invoices.repository';
import type { Invoice, Prisma } from '../../../generated/prisma/client';
import { IdempotencyService } from '../../idempotency/service/idempotency.service';
import { EventLogService } from '../../event-log/service/event-log.service';
import { GdcApiError } from '../../gdc/errors/gdc-api.error';
import { DEFAULT_VA_BANK_CODE } from '../../orders/constants/payment';
import {
  PAYMENT_GATEWAY,
  type CreateVaResult,
  type PaymentGateway,
} from '../gateway/payment-gateway.interface';

// Distinct namespace from orders so VA idempotency keys never collide.
const VA_CREATE_SCOPE = 'gdc.invoice.va.create';

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

  /** The VA provider is usable when GDC is selected or the dev stub is on. */
  isEnabled(): boolean {
    return (
      this.config.get<boolean>('app.gdcStub') === true ||
      this.config.get<string>('app.paymentProvider') === 'gdc'
    );
  }

  /** Idempotently provision a VA for a session-linked invoice. */
  async provision(invoiceId: string, name: string): Promise<Invoice | null> {
    const invoice = await this.repo.findById(invoiceId);
    if (!invoice) return null;
    if (invoice.vaNumber) return invoice;

    const externalId = invoice.id;
    const claim = await this.idempotency.begin({
      scope: VA_CREATE_SCOPE,
      key: externalId,
    });
    if (
      !claim.acquired &&
      claim.existing.status === 'COMPLETED' &&
      claim.existing.responseBody !== null
    ) {
      return this.repo.update(
        invoice.id,
        this.toColumns(
          externalId,
          claim.existing.responseBody as unknown as CreateVaResult,
        ),
      );
    }
    const claimId = claim.acquired ? claim.id : claim.existing.id;

    const event = await this.eventLog.record({
      source: 'GDC',
      direction: 'OUTBOUND',
      type: 'CREATE_VA_REQUEST',
      aggregateType: 'Invoice',
      aggregateId: invoice.id,
      reference: externalId,
      payload: {
        trxId: invoice.id,
        virtualAccountName: name,
        totalAmount: { value: invoice.amount.toFixed(2), currency: 'IDR' },
        bankCode: DEFAULT_VA_BANK_CODE,
      },
    });

    let result: CreateVaResult;
    try {
      result = await this.gateway.createVa({
        externalId,
        amount: invoice.amount,
        name,
        expiresAt:
          invoice.expiresAt ??
          new Date(Date.now() + this.paymentTtlMin * 60 * 1000),
      });
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
    return this.repo.update(invoice.id, this.toColumns(externalId, result));
  }

  private get paymentTtlMin(): number {
    return this.config.get<number>('app.paymentTtlMin', 60);
  }

  private toColumns(
    externalId: string,
    result: CreateVaResult,
  ): Prisma.InvoiceUpdateInput {
    return {
      vaNumber: result.vaNumber,
      vaBankCode: result.bankCode,
      gdcTrxId: result.trxId,
      gdcReferenceNo: result.referenceNo,
      gdcExternalId: externalId,
      paymentProvider: 'GDC_VA',
    };
  }
}
