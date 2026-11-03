import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventLogService } from '../../event-log/service/event-log.service';
import { IdempotencyService } from '../../idempotency/service/idempotency.service';
import { OrdersService } from '../../orders/service/orders.service';
import { OrderPaymentService } from '../../orders/service/order-payment.service';
import { InvoicesService } from '../../invoices/service/invoices.service';
import { InvoicePaymentService } from '../../invoices/service/invoice-payment.service';
import type {
  EventSource,
  Invoice,
  Order,
  PaymentProvider,
  PaymentVerifiedBySource,
} from '../../../generated/prisma/client';
import {
  PAYMENT_PROVIDER_ENV_TO_DB,
  resolveProviderEnv,
  toVerifiedBySource,
  toVerifiedBySourceFromEvent,
  type PaymentProviderEnv,
} from '../../../common/constants/payment-provider';
import { PaymentGatewayError } from '../gateway/payment-gateway.error';
import type { PaymentStatusResult } from '../gateway/payment-gateway.interface';
import type { PaymentNotification } from '../gateway/payment-notification';
import { MS_PER_MINUTE } from '../../../common/constants/time';
import { amountMatches } from '../utils/amount-matches';
import { PAYMENT_NOTIFICATION_EVENT_TYPE } from '../constants/payments';
import { toStoredPaymentNotification } from '../../midtrans/utils/to-payment-notification';

/**
 * Recovery-side twin of the ingress mappers: only the provider that wrote an
 * event can rebuild it from its stored payload. A source with no entry here is
 * left untouched rather than failed, so a build that does not know a provider
 * cannot corrupt its backlog.
 */
const NOTIFICATION_REBUILDERS: Partial<
  Record<EventSource, (payload: unknown) => PaymentNotification | null>
> = {
  MIDTRANS: toStoredPaymentNotification,
};

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

  private get providerEnv(): PaymentProviderEnv {
    return resolveProviderEnv(this.config.get<string>('app.paymentProvider'));
  }

  /** DB enum of the provider selected by `PAYMENT_PROVIDER`. */
  private get activeProvider(): PaymentProvider {
    return PAYMENT_PROVIDER_ENV_TO_DB[this.providerEnv];
  }

  /** Settlement attribution; `manual` is cleared by an admin, so it maps to ADMIN. */
  private get verifiedBySource(): PaymentVerifiedBySource {
    return toVerifiedBySource(this.providerEnv);
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
   * Settle one inbound callback. Idempotent per `notification.idempotencyKey`,
   * which the transport computed: a redelivery is dropped, a genuine state
   * change (pending -> settlement) is not.
   *
   * The provider's HTTP answer is the controller's business. Business outcomes
   * are recorded in the event log, never turned into a status code.
   */
  async handleNotification(notification: PaymentNotification): Promise<void> {
    const claim = await this.idempotency.begin({
      scope: this.notificationScope(notification.source),
      key: notification.idempotencyKey,
    });
    if (!claim.acquired) return;

    const event = await this.eventLog.record({
      source: notification.source,
      direction: 'INBOUND',
      type: PAYMENT_NOTIFICATION_EVENT_TYPE,
      reference: notification.providerOrderId,
      idempotencyKey: notification.idempotencyKey,
      payload: notification.payload,
    });

    const outcome = await this.applyNotification(notification, event.id);
    if (outcome.kind === 'rejected') {
      await this.idempotency.fail(claim.id, { errorMessage: outcome.reason });
    } else {
      await this.idempotency.complete(claim.id, {
        responseStatus: 200,
        responseBody: { outcome: outcome.kind },
      });
    }
  }

  /**
   * Record a callback that did not parse. A schema mismatch must never become a
   * retry storm, so this writes the audit row and returns.
   */
  async recordUnparsable(input: {
    source: PaymentNotification['source'];
    payload: unknown;
  }): Promise<void> {
    const event = await this.eventLog.record({
      source: input.source,
      direction: 'INBOUND',
      type: PAYMENT_NOTIFICATION_EVENT_TYPE,
      payload: { raw: input.payload },
    });
    await this.eventLog.markFailed(event.id, {
      errorMessage: 'unparsable_payload',
    });
  }

  /** Keeps the historical `midtrans.notification` scope for existing rows. */
  private notificationScope(source: PaymentNotification['source']): string {
    return `${source.toLowerCase()}.notification`;
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
        event.type !== PAYMENT_NOTIFICATION_EVENT_TYPE
      ) {
        continue;
      }
      const rebuild = NOTIFICATION_REBUILDERS[event.source];
      if (!rebuild) continue;
      const notification = rebuild(event.payload);
      if (!notification) {
        await this.eventLog.markFailed(event.id, {
          errorMessage: 'unparsable_payload',
        });
        continue;
      }
      await this.eventLog.markProcessing(event.id);
      await this.applyNotification(notification, event.id);
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
      if (await this.reconcileOrder(order)) settled += 1;
    }
    return { checked, settled };
  }

  /**
   * Ask the gateway about one order and unlock it when the money arrived.
   * Shared by the recovery pass and the buyer-facing status refresh, so both
   * paths settle through the same guarded write. Returns true only when this
   * call is the one that flipped the order to PAID.
   */
  async reconcileOrder(order: Order): Promise<boolean> {
    if (order.status !== 'PENDING' || !order.providerOrderId) return false;
    let status: PaymentStatusResult;
    try {
      status = await this.orderPayment.getStatus({
        providerOrderId: order.providerOrderId,
      });
    } catch (error) {
      if (error instanceof PaymentGatewayError) return false;
      throw error;
    }
    if (status.status !== 'PAID') return false;
    if (!amountMatches(status.paidAmount, order.amount)) return false;
    const result = await this.orders.confirmExternalPayment(
      order.id,
      this.verifiedBySource,
    );
    if (result.outcome !== 'verified') return false;
    await this.persistPaymentType('order', order.id, status.paymentType);
    return true;
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
      if (await this.reconcileInvoice(invoice)) settled += 1;
    }
    return { checked, settled };
  }

  /**
   * Invoice twin of `reconcileOrder`: one gateway lookup, one guarded settle.
   * The buyer-facing refresh calls this directly, so a payment that settled at
   * Midtrans no longer waits for the next recovery pass.
   */
  async reconcileInvoice(invoice: Invoice): Promise<boolean> {
    if (!this.invoicePayment.isEnabled()) return false;
    if (invoice.status !== 'UNPAID' || !invoice.providerOrderId) return false;
    let status: PaymentStatusResult;
    try {
      status = await this.invoicePayment.getStatus({
        providerOrderId: invoice.providerOrderId,
      });
    } catch (error) {
      if (error instanceof PaymentGatewayError) return false;
      throw error;
    }
    if (status.status !== 'PAID') return false;
    if (!amountMatches(status.paidAmount, invoice.amount)) return false;
    const result = await this.invoices.confirmPaymentWithActivation(
      invoice.id,
      {
        paidAmount: invoice.amount,
        verifiedBySource: this.verifiedBySource,
      },
    );
    if (result.outcome !== 'confirmed') return false;
    // The webhook never arrived (or arrived too early): surface the rescue so
    // a lost notification is visible in the logs instead of silent.
    this.logger.log(
      `reconciled invoice ${invoice.id} as paid (provider order ${invoice.providerOrderId})`,
    );
    await this.persistPaymentType('invoice', invoice.id, status.paymentType);
    return true;
  }

  /**
   * Resolve the notification target: a gateway order first, then a session
   * invoice. A provider echoes exactly one id (our `providerOrderId`), so an
   * unknown one is recorded and rejected — but still acked.
   */
  private async applyNotification(
    notification: PaymentNotification,
    eventId: string,
  ): Promise<CallbackOutcome> {
    const order = await this.orders.findByProviderOrderId(
      notification.providerOrderId,
    );
    if (order) {
      return this.applyOrderNotification(order, notification, eventId);
    }

    const invoice = await this.invoices.findByProviderOrderId(
      notification.providerOrderId,
    );
    if (invoice) {
      return this.applyInvoiceNotification(invoice, notification, eventId);
    }

    await this.eventLog.markFailed(eventId, {
      errorMessage: 'payment_not_found',
    });
    return { kind: 'rejected', reason: 'payment_not_found' };
  }

  private async applyOrderNotification(
    order: Order,
    notification: PaymentNotification,
    eventId: string,
  ): Promise<CallbackOutcome> {
    const { status } = notification;
    // Monotonic guard: a paid order never slides back to a non-paid state, no
    // matter what the provider reports afterwards.
    if (order.status === 'PAID' && status !== 'PAID') {
      await this.eventLog.markProcessed(eventId, {
        response: {
          ignored: 'already_paid',
          incoming: notification.rawStatus,
        },
      });
      return { kind: 'ignored', reason: 'already_paid' };
    }

    switch (status) {
      case 'PAID': {
        if (!amountMatches(notification.paidAmount, order.amount)) {
          await this.eventLog.markFailed(eventId, {
            errorMessage: 'amount_mismatch',
          });
          return { kind: 'rejected', reason: 'amount_mismatch' };
        }

        const result = await this.orders.confirmExternalPayment(
          order.id,
          toVerifiedBySourceFromEvent(notification.source),
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
          notification.paymentType,
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
        // A deny/failure is retryable: the provider lets the customer pay the
        // same order again, so the order must NOT be cancelled. A `cancel` is
        // different — that transaction is dead.
        if (notification.cancelled && order.status === 'PENDING') {
          try {
            await this.orders.cancel(
              order.id,
              `${notification.source.toLowerCase()}_cancel`,
            );
          } catch (error) {
            // A concurrent settle/cancel won the race; nothing to undo.
            this.logger.warn(
              `${notification.source} cancel ${order.id} skipped: ${error instanceof Error ? error.message : 'unknown_error'}`,
            );
          }
        }
        await this.eventLog.markProcessed(eventId, {
          response: { ignored: notification.rawStatus },
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
    notification: PaymentNotification,
    eventId: string,
  ): Promise<CallbackOutcome> {
    const { status } = notification;
    if (invoice.status === 'PAID' && status !== 'PAID') {
      await this.eventLog.markProcessed(eventId, {
        response: {
          ignored: 'already_paid',
          incoming: notification.rawStatus,
        },
      });
      return { kind: 'ignored', reason: 'already_paid' };
    }

    if (status !== 'PAID') {
      // InvoiceStatus has no EXPIRED and an unpaid invoice stays payable, so
      // the stored status is never touched here.
      await this.eventLog.markProcessed(eventId, {
        response: { ignored: notification.rawStatus },
      });
      return { kind: 'ignored', reason: 'non_paid_status' };
    }

    // The exact amount is compared inside confirmPaymentWithActivation, but a
    // settlement that carries no amount at all must never reach it: it would be
    // read as zero rather than as "unknown".
    if (notification.paidAmount === null) {
      await this.eventLog.markFailed(eventId, {
        errorMessage: 'amount_mismatch',
      });
      return { kind: 'rejected', reason: 'amount_mismatch' };
    }

    const result = await this.invoices.confirmPaymentWithActivation(
      invoice.id,
      {
        paidAmount: notification.paidAmount,
        verifiedBySource: toVerifiedBySourceFromEvent(notification.source),
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
      notification.paymentType,
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
}
