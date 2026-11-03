import { MidtransStoredNotificationSchema } from '../dto/midtrans.dto';
import type {
  MidtransNotification,
  MidtransStoredNotification,
} from '../dto/midtrans.dto';
import { mapTransactionStatus } from './map-status';
import type { PaymentNotification } from '../../payments/gateway/payment-notification';

/**
 * Normalises a provider amount into integer rupiah.
 *
 * Snap sends `gross_amount` as a decimal string ("200000.00"), and an absent or
 * empty value means "no amount", not zero — a settlement without an amount must
 * be rejected, never silently compared against 0.
 */
function toRupiah(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

/**
 * Snap notification → the provider-neutral shape.
 *
 * The idempotency key keeps its historical form
 * (`order_id:transaction_status:status_code`) because it is already persisted in
 * `idempotency_keys`; changing it would let a redelivery of an in-flight
 * notification through.
 */
export function toPaymentNotification(
  raw: MidtransNotification | MidtransStoredNotification,
): PaymentNotification {
  return {
    source: 'MIDTRANS',
    providerOrderId: raw.order_id,
    status: mapTransactionStatus(
      raw.transaction_status,
      raw.fraud_status ?? null,
    ),
    paidAmount: toRupiah(raw.gross_amount),
    paymentType: raw.payment_type ?? null,
    rawStatus: raw.transaction_status,
    cancelled: raw.transaction_status.toLowerCase() === 'cancel',
    idempotencyKey: `${raw.order_id}:${raw.transaction_status}:${raw.status_code}`,
    payload: {
      order_id: raw.order_id,
      transaction_id: raw.transaction_id,
      transaction_status: raw.transaction_status,
      status_code: raw.status_code,
      fraud_status: raw.fraud_status,
      payment_type: raw.payment_type,
      gross_amount: raw.gross_amount,
      transaction_time: raw.transaction_time,
      expiry_time: raw.expiry_time,
    },
  };
}

/**
 * Rebuild a notification from the redacted payload stored in `event_log`.
 *
 * The recovery pass has no signature to check (it was verified at ingress), but
 * it does need the same shape the ingress path produces, so it reuses the mapper
 * rather than re-deriving the fields. Returns null for a payload that no longer
 * parses.
 */
export function toStoredPaymentNotification(
  payload: unknown,
): PaymentNotification | null {
  const parsed = MidtransStoredNotificationSchema.safeParse(payload);
  return parsed.success ? toPaymentNotification(parsed.data) : null;
}
