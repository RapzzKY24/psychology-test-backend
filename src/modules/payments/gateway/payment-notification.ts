import type { EventSource } from '../../../generated/prisma/client';
import type { GatewayPaymentStatus } from './payment-gateway.interface';

/**
 * A provider callback reduced to the only facts settlement needs.
 *
 * Each transport maps its own payload into this shape at the edge, so the
 * orchestrator never learns a provider's field names. Idempotency, the event
 * log and the monotonic PAID guard all stay above the seam, which is what makes
 * a second provider a new mapper instead of a second settlement path.
 */
export interface PaymentNotification {
  /** Which provider sent it; names the audit row and scopes the claim. */
  source: EventSource;
  /** The id the provider echoes back — our `providerOrderId`. */
  providerOrderId: string;
  /** Already mapped into the gateway's four-state vocabulary. */
  status: GatewayPaymentStatus;
  /** Integer rupiah, or null when the provider sent no usable amount. */
  paidAmount: number | null;
  /** Channel the buyer used; recorded on the order/invoice, never trusted. */
  paymentType: string | null;
  /** The provider's own word for this status, kept for the event log. */
  rawStatus: string;
  /** True only when the provider says the transaction is dead, not retryable. */
  cancelled: boolean;
  /** A redelivery of the same notification yields the same key. */
  idempotencyKey: string;
  /** Redacted payload for the event log; never credentials or signatures. */
  payload: Record<string, unknown>;
}
