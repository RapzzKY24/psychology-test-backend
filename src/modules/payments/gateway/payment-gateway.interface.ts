export const PAYMENT_GATEWAY = 'PaymentGateway';

export type GatewayPaymentStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED';

export interface CreatePaymentCustomer {
  name?: string;
  email?: string;
  phone?: string;
}

export interface CreatePaymentParams {
  /** Stable id of the order/invoice. Used to derive the provider order id. */
  externalId: string;
  amount: number;
  expiresAt: Date;
  customer?: CreatePaymentCustomer;
}

export interface CreatePaymentResult {
  /** The id actually sent to the provider; the only key the provider echoes back. */
  providerOrderId: string;
  token: string;
  redirectUrl: string;
  transactionId: string;
}

export interface PaymentStatusResult {
  providerOrderId: string;
  status: GatewayPaymentStatus;
  paidAmount: number | null;
  paymentType: string | null;
}

/**
 * Single seam over the payment provider (Midtrans Snap). Idempotency, event
 * log, and recovery live above this seam and never know which transport
 * serves the request.
 */
export interface PaymentGateway {
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  getStatus(params: { providerOrderId: string }): Promise<PaymentStatusResult>;
}
