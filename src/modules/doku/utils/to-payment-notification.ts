import { toRupiah } from './doku-amount';
import { mapDokuStatus } from './map-doku-status';
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
