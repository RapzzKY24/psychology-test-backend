import type { GatewayPaymentStatus } from '../../payments/gateway/payment-gateway.interface';

/**
 * Classifies a Midtrans `transaction_status` (plus the optional
 * `fraud_status`) into the gateway's four-state vocabulary.
 *
 * This function only *classifies*; it holds no state. The monotonic PAID guard
 * — a paid order never sliding back to PENDING/EXPIRED/FAILED — lives in
 * PaymentsService, because only it can see the stored order state. Keeping the
 * guard out of here also keeps it provider-agnostic.
 *
 * `refund`, `partial_refund`, `chargeback` and `partial_chargeback` all map
 * to PAID on purpose: the money did arrive, and a refund must never make an
 * order look unpaid (that would re-open a settled order for payment).
 */
export function mapTransactionStatus(
  raw: string,
  fraudStatus?: string | null,
): GatewayPaymentStatus {
  const status = raw.toLowerCase();
  const fraud = fraudStatus?.toLowerCase() ?? null;

  if (status === 'settlement') {
    return 'PAID';
  }

  // Card captures need the fraud verdict: a denied capture never settles.
  if (status === 'capture') {
    return fraud === 'deny' ? 'PENDING' : 'PAID';
  }

  if (status === 'expire') {
    return 'EXPIRED';
  }

  if (status === 'deny' || status === 'cancel' || status === 'failure') {
    return 'FAILED';
  }

  if (
    status === 'refund' ||
    status === 'partial_refund' ||
    status === 'chargeback' ||
    status === 'partial_chargeback'
  ) {
    return 'PAID';
  }

  // 'pending', 'authorize', '' and anything Midtrans adds later.
  return 'PENDING';
}
