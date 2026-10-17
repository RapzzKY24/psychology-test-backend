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

export interface VaInquiryResult {
  vaNumber: string;
  /** Provider settlement flag (GDC `00` = paid). */
  status: string;
  paidAmount: number | null;
}

/**
 * Seam over the VA provider so dev/test can run without GDC. Selected in
 * `InvoicesModule` by config (`GDC_STUB`).
 */
export interface PaymentGateway {
  createVa(params: CreateVaParams): Promise<CreateVaResult>;
  inquiryVa(vaNumber: string): Promise<VaInquiryResult>;
}
