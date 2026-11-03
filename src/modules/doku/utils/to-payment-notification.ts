import { toRupiah } from './doku-amount';
import { mapDokuStatus } from './map-doku-status';
import { DokuStoredNotificationSchema } from '../dto/doku.dto';
import type { DokuNotification } from '../dto/doku.dto';
import type { PaymentNotification } from '../../payments/gateway/payment-notification';

/**
 * Doku callback → the provider-neutral shape.
 *
 * The idempotency key is `invoice_number:status`: Doku has no `status_code`
 * equivalent, and the status alone is enough to tell a redelivery from a genuine
 * state change.
 *
 * `cancelled` is true for FAILED/VOID/CANCELLED because those are terminal at
 * Doku — the invoice cannot be paid again, so keeping the order PENDING would
 * promise a payment that can never arrive.
 */
export function toDokuPaymentNotification(
  raw: DokuNotification,
): PaymentNotification {
  const status = mapDokuStatus(raw.transaction.status);

  return {
    source: 'DOKU',
    providerOrderId: raw.order.invoice_number,
    status,
    paidAmount: toRupiah(raw.order.amount),
    paymentType: raw.channel?.id ?? null,
    rawStatus: raw.transaction.status,
    cancelled: status === 'FAILED',
    idempotencyKey: `${raw.order.invoice_number}:${raw.transaction.status}`,
    payload: {
      invoice_number: raw.order.invoice_number,
      amount: raw.order.amount ?? null,
      status: raw.transaction.status,
      channel: raw.channel?.id ?? null,
      reference_no: raw.transaction.original_request_id ?? null,
      transaction_date: raw.transaction.date ?? null,
    },
  };
}

/**
 * Rebuild a notification from the redacted payload stored in `event_log`.
 *
 * The recovery pass has no signature to check (it was verified at ingress), but
 * it needs the same shape the ingress path produces. The stored payload is flat,
 * so it is reshaped into the callback body and pushed through the mapper above —
 * one mapping, no second copy that could drift.
 *
 * Returns null for a payload that no longer parses; the caller marks the event
 * failed instead of replaying it.
 */
export function toStoredDokuPaymentNotification(
  payload: unknown,
): PaymentNotification | null {
  const parsed = DokuStoredNotificationSchema.safeParse(payload);
  if (!parsed.success) return null;

  const stored = parsed.data;
  return toDokuPaymentNotification({
    order: {
      invoice_number: stored.invoice_number,
      amount: stored.amount ?? undefined,
    },
    transaction: {
      status: stored.status,
      original_request_id: stored.reference_no ?? undefined,
      date: stored.transaction_date ?? undefined,
    },
    channel: stored.channel ? { id: stored.channel } : undefined,
  });
}
