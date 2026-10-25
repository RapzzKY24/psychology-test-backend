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
  /** Legacy: only VA providers (Jokul) fill these. Midtrans returns null. */
  vaNumber?: string | null;
  bankCode?: string | null;
}

export interface PaymentStatusResult {
  providerOrderId: string;
  status: GatewayPaymentStatus;
  paidAmount: number | null;
  paymentType: string | null;
}

/**
 * Single seam over the payment provider. Midtrans Snap is the active
 * implementation; Jokul stays behind the same interface as a rollback path.
 * Idempotency, event log, and recovery live above this seam and never know
 * which provider is active.
 */
export interface PaymentGateway {
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  /** `vaNumber` is only needed by VA providers (Jokul); Midtrans ignores it. */
  getStatus(params: {
    providerOrderId: string;
    vaNumber?: string | null;
  }): Promise<PaymentStatusResult>;
}
