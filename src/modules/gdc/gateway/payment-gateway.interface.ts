export const PAYMENT_GATEWAY = 'PaymentGateway';

export interface CreateVaParams {
  externalId: string;
  amount: number;
  name: string;
  expiresAt: Date;
}

export interface CreateVaResult {
  vaNumber: string;
  bankCode: string;
  trxId: string;
  referenceNo: string | null;
}

export interface VaInquiryParams {
  vaNumber: string;
  /** SNAP request id; defaults to `vaNumber` when the caller has no GDC trx id. */
  paymentRequestId?: string;
  /** Idempotency header for the inquiry; defaults to `vaNumber`. */
  externalId?: string;
}

export interface VaInquiryResult {
  vaNumber: string;
  /** Provider settlement flag (GDC `00` = paid). */
  status: string;
  paidAmount: number | null;
}

/**
 * Seam over the VA provider so dev/test can run without GDC. Selected in
 * `GdcModule` by config (`GDC_STUB`); owned by `gdc` because it is pure
 * transport — order/invoice modules consume it and never touch `GdcClient`.
 */
export interface PaymentGateway {
  createVa(params: CreateVaParams): Promise<CreateVaResult>;
  inquiryVa(params: VaInquiryParams): Promise<VaInquiryResult>;
}
