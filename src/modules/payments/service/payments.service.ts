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
import type {
  GatewayPaymentStatus,
  PaymentStatusResult,
} from '../gateway/payment-gateway.interface';
import {
  MidtransNotificationSchema,
  MidtransStoredNotificationSchema,
} from '../../midtrans/dto/midtrans.dto';
import type { MidtransNotification } from '../../midtrans/dto/midtrans.dto';
import { mapTransactionStatus } from '../../midtrans/utils/map-status';
import { MS_PER_MINUTE } from '../../../common/constants/time';
import { amountMatches } from '../utils/amount-matches';
import {
  MIDTRANS_ACK,
  MIDTRANS_NOTIFICATION_EVENT_TYPE,
  MIDTRANS_NOTIFICATION_SCOPE,
} from '../constants/payments';
import type { MidtransAck } from '../constants/payments';

/** The fields every notification handler reads; the signature is not one. */
type NotificationPayload = Pick<
  MidtransNotification,
  | 'order_id'
  | 'status_code'
  | 'gross_amount'
  | 'transaction_status'
  | 'payment_type'
  | 'fraud_status'
>;

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
    const raw = this.config.get<string>('app.paymentProvider');
    const env: PaymentProviderEnv = raw === 'manual' ? 'manual' : 'midtrans';
    return PAYMENT_PROVIDER_ENV_TO_DB[env];
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
   * Handle a Midtrans HTTP notification. Idempotent per
   * `order_id:transaction_status:status_code` and always answers
   * `{ ok: true }` so Midtrans stops retrying; business outcomes are kept in
   * the event log instead of the HTTP status.
   */
  async handleNotification(body: unknown): Promise<MidtransAck> {
    const parsed = MidtransNotificationSchema.safeParse(body);
    if (!parsed.success) {
      // An unparsable body is recorded, never turned into a retry storm.
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

  /**
   * Replay notifications that were never finalized (e.g. a crash mid-handling).
   * The stored payload has no signature, and the replay path does not need it:
   * the signature was already verified at ingress.
   */
  async recoverStaleCallbacks(): Promise<number> {
    const stale = await this.eventLog.findStaleForRecovery({
      olderThan: new Date(Date.now() - this.staleAfterMs),
      limit: this.batchSize,
    });
    let replayed = 0;
    for (const event of stale) {
      if (
        event.payload === null ||
        event.type !== MIDTRANS_NOTIFICATION_EVENT_TYPE
      ) {
        continue;
      }
      const parsed = MidtransStoredNotificationSchema.safeParse(event.payload);
      if (!parsed.success) {
        await this.eventLog.markFailed(event.id, {
          errorMessage: 'unparsable_payload',
        });
        continue;
      }
      await this.eventLog.markProcessing(event.id);
      await this.applyNotification(parsed.data, event.id);
      replayed += 1;
    }
    return replayed;
  }

  /**
   * Retry provisioning for gateway orders whose create-payment call failed
   * (PENDING, no `providerOrderId`). Reuses `order.id` as the external id, so
   * a duplicate at the provider is deduped and no second payment is issued.
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

  /**
   * Poll the provider for orders still unsettled after their payment window
   * closed, and unlock any that were paid but never notified. This is the
   * safety net for a lost or delayed webhook, so it must never depend on one:
   * the provider is asked directly.
   */
  async reconcilePendingPayments(): Promise<{
    checked: number;
    settled: number;
  }> {
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
      // The query already excludes orders without a provider order id; the
      // guard keeps the type honest and skips a race with a concurrent write.
      if (!order.providerOrderId) continue;
      checked += 1;
      let status: PaymentStatusResult;
      try {
        status = await this.orderPayment.getStatus({
          providerOrderId: order.providerOrderId,
        });
      } catch (error) {
        if (error instanceof PaymentGatewayError) continue;
        throw error;
      }
      if (status.status !== 'PAID') continue;
      if (!amountMatches(status.paidAmount, order.amount)) continue;
      const result = await this.orders.confirmExternalPayment(
        order.id,
        'MIDTRANS',
      );
      if (result.outcome !== 'verified') continue;
      settled += 1;
      await this.persistPaymentType('order', order.id, status.paymentType);
    }
    return { checked, settled };
  }

  /**
   * Retry provisioning for session invoices whose create-payment call failed
   * (UNPAID, no `providerOrderId`). Reuses the invoice id as the external id,
   * so a duplicate at the gateway is deduped by the idempotency layer.
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

  /** Invoice twin of `reconcilePendingPayments`. */
  async reconcileUnsettledInvoicePayments(): Promise<{
    checked: number;
    settled: number;
  }> {
    if (!this.invoicePayment.isEnabled()) return { checked: 0, settled: 0 };
    const now = new Date();
    const due = await this.invoices.findUnsettledInvoices({
      provider: this.activeProvider,
      createdBefore: new Date(now.getTime() - this.staleAfterMs),
      notBefore: new Date(now.getTime() - this.lookbackMs),
      limit: this.batchSize,
    });
    let checked = 0;
    let settled = 0;
    for (const invoice of due) {
      if (!invoice.providerOrderId) continue;
      checked += 1;
      let status: PaymentStatusResult;
      try {
        status = await this.invoicePayment.getStatus({
          providerOrderId: invoice.providerOrderId,
        });
      } catch (error) {
        if (error instanceof PaymentGatewayError) continue;
        throw error;
      }
      if (status.status !== 'PAID') continue;
      if (!amountMatches(status.paidAmount, invoice.amount)) continue;
      const result = await this.invoices.confirmPaymentWithActivation(
        invoice.id,
        {
          paidAmount: invoice.amount,
          verifiedBySource: 'MIDTRANS',
        },
      );
      if (result.outcome !== 'confirmed') continue;
      settled += 1;
      // The webhook never arrived (or arrived too early): surface the rescue so
      // a lost notification is visible in the logs instead of silent.
      this.logger.log(
        `reconciled invoice ${invoice.id} as paid (provider order ${invoice.providerOrderId})`,
      );
      await this.persistPaymentType('invoice', invoice.id, status.paymentType);
    }
    return { checked, settled };
  }

  /**
   * Resolve the notification target: a gateway order first, then a session
   * invoice. Midtrans only echoes `order_id` (our `providerOrderId`), so an
   * unknown id is recorded and rejected — but still acked.
   */
  private async applyNotification(
    payload: NotificationPayload,
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
    payload: NotificationPayload,
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

        const result = await this.orders.confirmExternalPayment(
          order.id,
          'MIDTRANS',
        );
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
    payload: NotificationPayload,
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
    // the paid amount with the invoice amount internally.
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
