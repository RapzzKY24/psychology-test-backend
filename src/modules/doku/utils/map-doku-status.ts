import type { GatewayPaymentStatus } from '../../payments/gateway/payment-gateway.interface';

/**
 * Doku `transaction.status` → the gateway's four-state vocabulary.
 *
 * `REFUNDED` maps to PAID on purpose, diverging from Doku's own "money went
 * back" reading: the money did arrive, and a refund must never make an order
 * look unpaid. That is the same rule `mapTransactionStatus` applies to Snap
 * refunds and chargebacks, and two providers must not disagree about whether an
 * order is settled. Refunds as a product feature would be a new state machine,
 * not a status mapping.
 */
export function mapDokuStatus(raw: string): GatewayPaymentStatus {
  switch (raw.trim().toUpperCase()) {
    case 'SUCCESS':
      return 'PAID';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'FAILED':
    case 'VOID':
    case 'VOIDED':
    case 'CANCELLED':
      return 'FAILED';
    case 'REFUNDED':
      return 'PAID';
    default:
      return 'PENDING';
  }
}

/** Terminal at the provider: the invoice cannot be paid again. */
export function isDokuTerminalFailure(raw: string): boolean {
  return mapDokuStatus(raw) === 'FAILED';
}
