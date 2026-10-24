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
  /** Provider request id; defaults to `vaNumber` when the caller has no trx id. */
  paymentRequestId?: string;
  /** Idempotency header for the inquiry; defaults to `vaNumber`. */
  externalId?: string;
}

export interface VaInquiryResult {
  vaNumber: string;
  /** Provider settlement flag (Doku `00` = paid). */
  status: string;
  paidAmount: number | null;
}

/**
 * Seam over the VA provider so dev/test can run without Doku. Selected in
 * `DokuModule` by config (`DOKU_STUB`); owned by `doku` because it is pure
 * transport — order/invoice modules consume it and never touch `DokuClient`.
 */
export interface PaymentGateway {
  createVa(params: CreateVaParams): Promise<CreateVaResult>;
  inquiryVa(params: VaInquiryParams): Promise<VaInquiryResult>;
}
