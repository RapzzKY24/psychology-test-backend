import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventLogService } from '../../event-log/service/event-log.service';
import { IdempotencyService } from '../../idempotency/service/idempotency.service';
import { OrdersService } from '../../orders/service/orders.service';
import { OrderPaymentService } from '../../orders/service/order-payment.service';
import { InvoicesService } from '../../invoices/service/invoices.service';
import { InvoicePaymentService } from '../../invoices/service/invoice-payment.service';
import type {
  Invoice,
  Order,
  PaymentProvider,
} from '../../../generated/prisma/client';
import {
  PAYMENT_PROVIDER_ENV_TO_DB,
  type PaymentProviderEnv,
} from '../../../common/constants/payment-provider';
import { PaymentGatewayError } from '../gateway/payment-gateway.error';
import type { GatewayPaymentStatus } from '../gateway/payment-gateway.interface';
import { VaCallbackSchema } from '../../jokul/dto/jokul.dto';
import type { VaCallback } from '../../jokul/dto/jokul.dto';
import { MidtransNotificationSchema } from '../../midtrans/dto/midtrans.dto';
import type { MidtransNotification } from '../../midtrans/dto/midtrans.dto';
import { mapTransactionStatus } from '../../midtrans/utils/map-status';
import { MS_PER_MINUTE } from '../../../common/constants/time';
import { amountMatches } from '../utils/amount-matches';
import {
  JOKUL_ACK,
  MIDTRANS_ACK,
  MIDTRANS_NOTIFICATION_EVENT_TYPE,
  MIDTRANS_NOTIFICATION_SCOPE,
  VA_CALLBACK_EVENT_TYPE,
  VA_CALLBACK_KEY_PREFIX,
  VA_CALLBACK_PAID_STATUS,
  VA_CALLBACK_SCOPE,
  VA_INQUIRY_PAID_STATUS,
} from '../constants/payments';
import type { JokulAck, MidtransAck } from '../constants/payments';

/** Shape returned by both payment services' `inquiryVa` (legacy Jokul status codes). */
type VaInquiryResult = Awaited<ReturnType<OrderPaymentService['inquiryVa']>>;

type CallbackOutcome =
  | { kind: 'settled' }
  | { kind: 'ignored'; reason: string }
  | { kind: 'rejected'; reason: string };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly orders: OrdersService,
    private readonly invoices: InvoicesService,
    private readonly invoicePayment: InvoicePaymentService,
    private readonly orderPayment: OrderPaymentService,
    private readonly eventLog: EventLogService,
    private readonly idempotency: IdempotencyService,
    private readonly config: ConfigService,
  ) {}

  /** DB enum of the provider selected by `PAYMENT_PROVIDER`. */
  private get activeProvider(): PaymentProvider {
    const env = (this.config.get<string>('app.paymentProvider') ??
      'jokul') as PaymentProviderEnv;
    return PAYMENT_PROVIDER_ENV_TO_DB[env] ?? 'JOKUL_VA';
  }

  private get staleAfterMs(): number {
    return (
      this.config.get<number>('app.recovery.staleAfterMin', 5) * MS_PER_MINUTE
    );
  }

  private get lookbackMs(): number {
    return (
      this.config.get<number>('app.recovery.lookbackMin', 1440) * MS_PER_MINUTE
    );
  }

  private get batchSize(): number {
    return this.config.get<number>('app.recovery.batchSize', 50);
  }

  /**
   * Handle a VA payment callback from Doku. Idempotent per
   * `virtualAccountNo:trxId`, always acknowledges with Doku's `2002700`
   * envelope so the gateway does not retry on our business-level outcomes.
   */
  async handleVaCallback(body: unknown): Promise<JokulAck> {
    const parsed = VaCallbackSchema.safeParse(body);
    if (!parsed.success) {
      // Never let a schema mismatch turn into a 422 retry storm: record it for
      // investigation and still acknowledge.
      const event = await this.eventLog.record({
        source: 'JOKUL',
        direction: 'INBOUND',
        type: VA_CALLBACK_EVENT_TYPE,
        payload: { raw: body },
      });
      await this.eventLog.markFailed(event.id, {
        errorMessage: 'unparsable_payload',
      });
      return JOKUL_ACK;
    }
    const payload = parsed.data;
    const reference =
      payload.trxId ?? payload.paymentRequestId ?? payload.virtualAccountNo;
    const key = `${VA_CALLBACK_KEY_PREFIX}${payload.virtualAccountNo}:${reference}`;

    const claim = await this.idempotency.begin({
      scope: VA_CALLBACK_SCOPE,
      key,
    });
    if (!claim.acquired) return JOKUL_ACK;

    const event = await this.eventLog.record({
      source: 'JOKUL',
      direction: 'INBOUND',
      type: VA_CALLBACK_EVENT_TYPE,
      reference,
      idempotencyKey: key,
      payload: this.redact(payload),
    });

    const outcome = await this.applyCallback(payload, event.id);
    if (outcome.kind === 'rejected') {
      await this.idempotency.fail(claim.id, { errorMessage: outcome.reason });
    } else {
      await this.idempotency.complete(claim.id, {
        responseStatus: 200,
        responseBody: JOKUL_ACK,
      });
    }
    return JOKUL_ACK;
  }

  /**
   * Handle a Midtrans HTTP notification. Idempotent per
   * `order_id:transaction_status:status_code` and always answers
   * `{ ok: true }` so Midtrans stops retrying; business outcomes are kept in
   * the event log instead of the HTTP status.
   */
  async handleNotification(body: unknown): Promise<MidtransAck> {
    const parsed = MidtransNotificationSchema.safeParse(body);
    if (!parsed.success) {
      // Same policy as the Jokul path: an unparsable body is recorded, never
      // turned into a retry storm.
      const event = await this.eventLog.record({
        source: 'MIDTRANS',
        direction: 'INBOUND',
        type: MIDTRANS_NOTIFICATION_EVENT_TYPE,
        payload: { raw: body },
      });
      await this.eventLog.markFailed(event.id, {
        errorMessage: 'unparsable_payload',
      });
      return MIDTRANS_ACK;
    }

    const payload = parsed.data;
    // A retried notification carries the same triple, so a redelivery is
    // dropped; a genuine state change (pending -> settlement) is not.
    const key = `${payload.order_id}:${payload.transaction_status}:${payload.status_code}`;

    const claim = await this.idempotency.begin({
      scope: MIDTRANS_NOTIFICATION_SCOPE,
      key,
    });
    if (!claim.acquired) return MIDTRANS_ACK;

    const event = await this.eventLog.record({
      source: 'MIDTRANS',
      direction: 'INBOUND',
      type: MIDTRANS_NOTIFICATION_EVENT_TYPE,
      reference: payload.order_id,
      idempotencyKey: key,
      payload: this.redactMidtrans(payload),
    });

    const outcome = await this.applyNotification(payload, event.id);
    if (outcome.kind === 'rejected') {
      await this.idempotency.fail(claim.id, { errorMessage: outcome.reason });
    } else {
      await this.idempotency.complete(claim.id, {
        responseStatus: 200,
        responseBody: MIDTRANS_ACK,
      });
    }
    return MIDTRANS_ACK;
  }

  /** Replay inbound callbacks that were never finalized (e.g. a crash mid-handling). */
  async recoverStaleCallbacks(): Promise<number> {
    const stale = await this.eventLog.findStaleForRecovery({
      olderThan: new Date(Date.now() - this.staleAfterMs),
      limit: this.batchSize,
    });
    let replayed = 0;
    for (const event of stale) {
      if (event.type !== VA_CALLBACK_EVENT_TYPE || event.payload === null) {
        continue;
      }
      const parsed = VaCallbackSchema.safeParse(event.payload);
      if (!parsed.success) {
        await this.eventLog.markFailed(event.id, {
          errorMessage: 'unparsable_payload',
        });
        continue;
      }
      await this.eventLog.markProcessing(event.id);
      await this.applyCallback(parsed.data, event.id);
      replayed += 1;
    }
    return replayed;
  }

  /**
   * Retry VA provisioning for gateway orders whose create-va call failed
   * (PENDING, no `vaNumber`). Reuses `order.id` as the external id, so a
   * duplicate at DOKU is deduped and no second VA is issued.
   */
  async recoverStaleProvisioning(): Promise<{
    checked: number;
    provisioned: number;
  }> {
    const due = await this.orders.findPendingOrdersWithoutProviderOrderId({
      provider: this.activeProvider,
      createdBefore: new Date(Date.now() - this.staleAfterMs),
      limit: this.batchSize,
    });
    let provisioned = 0;
    for (const order of due) {
      try {
        const updated = await this.orders.reprovision(order.id);
        if (updated?.providerOrderId) provisioned += 1;
      } catch (error) {
        if (
          error instanceof PaymentGatewayError ||
          error instanceof BadGatewayException
        ) {
          this.logger.warn(`reprovision ${order.id} failed: ${error.message}`);
          continue;
        }
        throw error;
      }
    }
    return { checked: due.length, provisioned };
  }

  /** Poll DOKU for VA orders still unsettled after expiry and unlock any that were paid. */
  async reconcilePendingVas(): Promise<{ checked: number; settled: number }> {
    const now = new Date();
    const due = await this.orders.findUnsettledOrders({
      provider: this.activeProvider,
      dueBefore: now,
      notBefore: new Date(now.getTime() - this.lookbackMs),
      limit: this.batchSize,
    });
    let checked = 0;
    let settled = 0;
    for (const order of due) {
      if (!order.vaNumber) continue;
      checked += 1;
      let status: VaInquiryResult;
      try {
        status = await this.orderPayment.inquiryVa({
          vaNumber: order.vaNumber,
          paymentRequestId: order.id,
          externalId: order.id,
        });
      } catch (error) {
        if (error instanceof PaymentGatewayError) continue;
        throw error;
      }
      if (status.status !== VA_INQUIRY_PAID_STATUS) continue;
      if (!amountMatches(status.paidAmount, order.amount)) continue;
      const result = await this.orders.confirmExternalPayment(order.id);
      if (result.outcome === 'verified') settled += 1;
    }
    return { checked, settled };
  }

  /**
   * Resolve the payment target for a VA callback: a gateway order first, then a
   * session invoice. An unknown VA is recorded and rejected (but still acked).
   */
  /**
   * Retry VA provisioning for session invoices whose create-va call failed
   * (UNPAID, no `vaNumber`). Reuses the invoice id as the external id, so a
   * duplicate at the gateway is deduped by the idempotency layer.
   */
  async recoverStaleInvoiceProvisioning(): Promise<{
    checked: number;
    provisioned: number;
  }> {
    if (!this.invoicePayment.isEnabled()) return { checked: 0, provisioned: 0 };
    const due = await this.invoices.findUnpaidWithoutProviderOrderId({
      provider: this.activeProvider,
      createdBefore: new Date(Date.now() - this.staleAfterMs),
      limit: this.batchSize,
    });
    let provisioned = 0;
    for (const invoice of due) {
      try {
        const updated = await this.invoicePayment.provision(
          invoice.id,
          invoice.number,
        );
        if (updated?.providerOrderId) provisioned += 1;
      } catch (error) {
        if (
          error instanceof PaymentGatewayError ||
          error instanceof BadGatewayException
        ) {
          this.logger.warn(
            `invoice reprovision ${invoice.id} failed: ${error.message}`,
          );
          continue;
        }
        throw error;
      }
    }
    return { checked: due.length, provisioned };
  }

  /** Poll DOKU for invoice VAs still unsettled after expiry and unlock any that were paid. */
  async reconcileUnsettledInvoiceVas(): Promise<{
    checked: number;
    settled: number;
  }> {
    if (!this.invoicePayment.isEnabled()) return { checked: 0, settled: 0 };
    const now = new Date();
    const due = await this.invoices.findUnsettledInvoices({
      provider: this.activeProvider,
      dueBefore: now,
      notBefore: new Date(now.getTime() - this.lookbackMs),
      limit: this.batchSize,
    });
    let checked = 0;
    let settled = 0;
    for (const invoice of due) {
      if (!invoice.vaNumber) continue;
      checked += 1;
      let status: VaInquiryResult;
      try {
        status = await this.invoicePayment.inquiryVa({
          vaNumber: invoice.vaNumber,
          paymentRequestId: invoice.id,
          externalId: invoice.id,
        });
      } catch (error) {
        if (error instanceof PaymentGatewayError) continue;
        throw error;
      }
      if (status.status !== VA_INQUIRY_PAID_STATUS) continue;
      if (!amountMatches(status.paidAmount, invoice.amount)) continue;
      const result = await this.invoices.confirmPaymentWithActivation(
        invoice.id,
        {
          paidAmount: invoice.amount,
          verifiedBySource: 'JOKUL',
        },
      );
      if (result.outcome === 'confirmed') settled += 1;
    }
    return { checked, settled };
  }

  private async applyCallback(
    payload: VaCallback,
    eventId: string,
  ): Promise<CallbackOutcome> {
    const order = await this.orders.findByVaNumber(payload.virtualAccountNo);
    if (order) return this.applyOrderCallback(order, payload, eventId);

    const invoice = await this.invoices.findByVaNumber(
      payload.virtualAccountNo,
    );
    if (invoice) return this.applyInvoiceCallback(invoice, payload, eventId);

    await this.eventLog.markFailed(eventId, {
      errorMessage: 'payment_not_found',
    });
    return { kind: 'rejected', reason: 'payment_not_found' };
  }

  private async applyOrderCallback(
    order: Order,
    payload: VaCallback,
    eventId: string,
  ): Promise<CallbackOutcome> {
    const status = this.callbackStatus(payload);
    if (status !== undefined && status !== VA_CALLBACK_PAID_STATUS) {
      await this.eventLog.markProcessed(eventId, {
        response: { ignored: status },
      });
      return { kind: 'ignored', reason: 'non_paid_status' };
    }

    if (!amountMatches(this.callbackAmount(payload), order.amount)) {
      await this.eventLog.markFailed(eventId, {
        errorMessage: 'amount_mismatch',
      });
      return { kind: 'rejected', reason: 'amount_mismatch' };
    }

    const result = await this.orders.confirmExternalPayment(order.id);
    if (result.outcome === 'conflict') {
      await this.eventLog.markProcessed(eventId, {
        response: { alreadySettled: true, orderId: order.id },
      });
      return { kind: 'ignored', reason: 'already_settled' };
    }
    if (result.outcome !== 'verified') {
      await this.eventLog.markFailed(eventId, {
        errorMessage: `settle_${result.outcome}`,
      });
      return { kind: 'rejected', reason: `settle_${result.outcome}` };
    }

    await this.eventLog.markProcessed(eventId, {
      response: {
        orderId: order.id,
        sessionId: result.sessionId,
        wasLate: result.wasLate,
      },
    });
    return { kind: 'settled' };
  }

  private async applyInvoiceCallback(
    invoice: Invoice,
    payload: VaCallback,
    eventId: string,
  ): Promise<CallbackOutcome> {
    const status = this.callbackStatus(payload);
    if (status !== undefined && status !== VA_CALLBACK_PAID_STATUS) {
      await this.eventLog.markProcessed(eventId, {
        response: { ignored: status },
      });
      return { kind: 'ignored', reason: 'non_paid_status' };
    }

    const result = await this.invoices.confirmPaymentWithActivation(
      invoice.id,
      {
        paidAmount: Number(this.callbackAmount(payload)),
        verifiedBySource: 'JOKUL',
      },
    );
    if (result.outcome === 'already_paid') {
      await this.eventLog.markProcessed(eventId, {
        response: { alreadySettled: true, invoiceId: invoice.id },
      });
      return { kind: 'ignored', reason: 'already_settled' };
    }
    if (result.outcome !== 'confirmed') {
      await this.eventLog.markFailed(eventId, {
        errorMessage: `settle_${result.outcome}`,
      });
      return { kind: 'rejected', reason: `settle_${result.outcome}` };
    }

    await this.eventLog.markProcessed(eventId, {
      response: {
        invoiceId: invoice.id,
        sessionId: invoice.sessionId,
      },
    });
    return { kind: 'settled' };
  }

  /** Doku notifies on success; a channel may still send an explicit status. */
  private callbackStatus(payload: VaCallback): string | undefined {
    return (
      payload.latestTransactionStatus ??
      payload.additionalInfo?.latestTransactionStatus
    );
  }

  /** Prefer the actually paid amount; fall back to the billed amount. */
  private callbackAmount(payload: VaCallback): string | null {
    return payload.paidAmount?.value ?? payload.totalAmount?.value ?? null;
  }

  private redact(payload: VaCallback): Record<string, unknown> {
    return {
      virtualAccountNo: payload.virtualAccountNo,
      trxId: payload.trxId,
      paymentRequestId: payload.paymentRequestId,
      paidAmount: payload.paidAmount,
      totalAmount: payload.totalAmount,
      trxDateTime: payload.trxDateTime,
      latestTransactionStatus: this.callbackStatus(payload),
    };
  }

  /**
   * Resolve the notification target: a gateway order first, then a session
   * invoice. Midtrans only echoes `order_id` (our `providerOrderId`), so an
   * unknown id is recorded and rejected — but still acked.
   */
  private async applyNotification(
    payload: MidtransNotification,
    eventId: string,
  ): Promise<CallbackOutcome> {
    const status = mapTransactionStatus(
      payload.transaction_status,
      payload.fraud_status ?? null,
    );

    const order = await this.orders.findByProviderOrderId(payload.order_id);
    if (order) {
      return this.applyOrderNotification(order, payload, status, eventId);
    }

    const invoice = await this.invoices.findByProviderOrderId(payload.order_id);
    if (invoice) {
      return this.applyInvoiceNotification(invoice, payload, status, eventId);
    }

    await this.eventLog.markFailed(eventId, {
      errorMessage: 'payment_not_found',
    });
    return { kind: 'rejected', reason: 'payment_not_found' };
  }

  private async applyOrderNotification(
    order: Order,
    payload: MidtransNotification,
    status: GatewayPaymentStatus,
    eventId: string,
  ): Promise<CallbackOutcome> {
    // Monotonic guard: a paid order never slides back to a non-paid state, no
    // matter what the provider reports afterwards.
    if (order.status === 'PAID' && status !== 'PAID') {
      await this.eventLog.markProcessed(eventId, {
        response: {
          ignored: 'already_paid',
          incoming: payload.transaction_status,
        },
      });
      return { kind: 'ignored', reason: 'already_paid' };
    }

    switch (status) {
      case 'PAID': {
        if (!amountMatches(payload.gross_amount, order.amount)) {
          await this.eventLog.markFailed(eventId, {
            errorMessage: 'amount_mismatch',
          });
          return { kind: 'rejected', reason: 'amount_mismatch' };
        }

        const result = await this.orders.confirmExternalPayment(order.id);
        if (result.outcome === 'conflict') {
          await this.eventLog.markProcessed(eventId, {
            response: { alreadySettled: true, orderId: order.id },
          });
          return { kind: 'ignored', reason: 'already_settled' };
        }
        if (result.outcome !== 'verified') {
          await this.eventLog.markFailed(eventId, {
            errorMessage: `settle_${result.outcome}`,
          });
          return { kind: 'rejected', reason: `settle_${result.outcome}` };
        }

        await this.persistPaymentType(
          'order',
          order.id,
          payload.payment_type ?? null,
        );
        await this.eventLog.markProcessed(eventId, {
          response: {
            orderId: order.id,
            sessionId: result.sessionId,
            wasLate: result.wasLate,
          },
        });
        return { kind: 'settled' };
      }

      case 'EXPIRED':
        // OrdersService exposes no markExpired; the lazy expiry in
        // OrdersService.listPayments settles the stored status, so only the
        // provider verdict is recorded here.
        await this.eventLog.markProcessed(eventId, {
          response: { expired: true, orderId: order.id },
        });
        return { kind: 'ignored', reason: 'expired' };

      case 'FAILED':
        // A deny/failure is retryable: Midtrans lets the customer pay the same
        // order_id again, so the order must NOT be cancelled. A `cancel` is
        // different — that transaction is dead.
        if (
          payload.transaction_status.toLowerCase() === 'cancel' &&
          order.status === 'PENDING'
        ) {
          try {
            await this.orders.cancel(order.id, 'midtrans_cancel');
          } catch (error) {
            // A concurrent settle/cancel won the race; nothing to undo.
            this.logger.warn(
              `midtrans cancel ${order.id} skipped: ${error instanceof Error ? error.message : 'unknown_error'}`,
            );
          }
        }
        await this.eventLog.markProcessed(eventId, {
          response: { ignored: payload.transaction_status },
        });
        return { kind: 'ignored', reason: 'non_paid_status' };

      case 'PENDING':
        await this.eventLog.markProcessed(eventId, {
          response: { pending: true },
        });
        return { kind: 'ignored', reason: 'non_paid_status' };
    }
  }

  private async applyInvoiceNotification(
    invoice: Invoice,
    payload: MidtransNotification,
    status: GatewayPaymentStatus,
    eventId: string,
  ): Promise<CallbackOutcome> {
    if (invoice.status === 'PAID' && status !== 'PAID') {
      await this.eventLog.markProcessed(eventId, {
        response: {
          ignored: 'already_paid',
          incoming: payload.transaction_status,
        },
      });
      return { kind: 'ignored', reason: 'already_paid' };
    }

    if (status !== 'PAID') {
      // InvoiceStatus has no EXPIRED and an unpaid invoice stays payable, so
      // the stored status is never touched here.
      await this.eventLog.markProcessed(eventId, {
        response: { ignored: payload.transaction_status },
      });
      return { kind: 'ignored', reason: 'non_paid_status' };
    }

    // No amount guard here on purpose: confirmPaymentWithActivation compares
    // the paid amount with the invoice amount internally, exactly as the Jokul
    // path relies on.
    const result = await this.invoices.confirmPaymentWithActivation(
      invoice.id,
      {
        paidAmount: Number(payload.gross_amount),
        verifiedBySource: 'MIDTRANS',
      },
    );
    if (result.outcome === 'already_paid') {
      await this.eventLog.markProcessed(eventId, {
        response: { alreadySettled: true, invoiceId: invoice.id },
      });
      return { kind: 'ignored', reason: 'already_settled' };
    }
    if (result.outcome !== 'confirmed') {
      await this.eventLog.markFailed(eventId, {
        errorMessage: `settle_${result.outcome}`,
      });
      return { kind: 'rejected', reason: `settle_${result.outcome}` };
    }

    await this.persistPaymentType(
      'invoice',
      invoice.id,
      payload.payment_type ?? null,
    );
    await this.eventLog.markProcessed(eventId, {
      response: { invoiceId: invoice.id, sessionId: invoice.sessionId },
    });
    return { kind: 'settled' };
  }

  /**
   * Store the method the customer actually paid with. Best effort: the
   * settlement is already committed, so a failed write is only logged.
   */
  private async persistPaymentType(
    kind: 'order' | 'invoice',
    id: string,
    paymentType: string | null,
  ): Promise<void> {
    if (!paymentType) return;
    try {
      if (kind === 'order') {
        await this.orders.updatePaymentType(id, paymentType);
      } else {
        await this.invoices.updatePaymentType(id, paymentType);
      }
    } catch (error) {
      this.logger.warn(
        `persist paymentType ${kind} ${id} failed: ${error instanceof Error ? error.message : 'unknown_error'}`,
      );
    }
  }

  /** Notification payload without the signature or any credential. */
  private redactMidtrans(
    payload: MidtransNotification,
  ): Record<string, unknown> {
    return {
      order_id: payload.order_id,
      transaction_id: payload.transaction_id,
      transaction_status: payload.transaction_status,
      status_code: payload.status_code,
      fraud_status: payload.fraud_status,
      payment_type: payload.payment_type,
      gross_amount: payload.gross_amount,
      transaction_time: payload.transaction_time,
      expiry_time: payload.expiry_time,
    };
  }
}
