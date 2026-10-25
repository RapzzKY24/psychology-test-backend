import type {
  Invoice,
  PaymentVerifiedBySource,
  Prisma,
} from '../../../generated/prisma/client';

export const INVOICES_REPOSITORY = 'InvoicesRepository';

export type ConfirmInvoicePaymentResult =
  | { outcome: 'confirmed'; invoice: Invoice }
  | { outcome: 'already_paid'; invoice: Invoice }
  | { outcome: 'amount_mismatch' }
  | { outcome: 'conflict'; reason: 'invoice_cancelled' }
  | { outcome: 'not_found' };

export interface ConfirmInvoicePaymentParams {
  paidAmount: number;
  verifiedBySource: PaymentVerifiedBySource;
}

export interface InvoicesRepository {
  findById(id: string): Promise<Invoice | null>;
  findMany(params: {
    where: Prisma.InvoiceWhereInput;
    skip: number;
    take: number;
    orderBy?: Prisma.InvoiceOrderByWithRelationInput;
  }): Promise<{ data: Invoice[]; total: number }>;
  create(data: Prisma.InvoiceCreateInput): Promise<Invoice>;
  update(id: string, data: Prisma.InvoiceUpdateInput): Promise<Invoice>;
  institutionExists(id: string): Promise<boolean>;
  /** Create an invoice with the next INV-YYYY-NNNN number for the given year,
   * serialized by a per-year advisory lock inside one transaction. */
  createNextNumbered(params: {
    institutionId: string;
    amount: number;
    dueDate?: Date;
    notes?: string;
    year: number;
  }): Promise<Invoice>;
  /** Numbered invoice linked to a test session (the instansi batch payment gate). */
  createForSession(params: {
    institutionId: string;
    amount: number;
    sessionId: string;
    expiresAt?: Date;
    notes?: string;
  }): Promise<Invoice>;
  findBySessionId(sessionId: string): Promise<Invoice | null>;
  findByVaNumber(vaNumber: string): Promise<Invoice | null>;
  /**
   * Exactly-once settlement: in one transaction mark the invoice PAID (payment
   * columns set) and activate its session (`PENDING_PAYMENT → ACTIVE`).
   * Idempotent — a re-run on a PAID invoice changes nothing.
   */
  confirmPaymentWithActivation(
    invoiceId: string,
    params: ConfirmInvoicePaymentParams,
  ): Promise<ConfirmInvoicePaymentResult>;
  /** Recompute the invoice amount (batch roster changed while UNPAID). */
  regenerateAmount(invoiceId: string, amount: number): Promise<Invoice>;
  /** UNPAID invoices with no VA yet, created before `createdBefore` (recovery). */
  findUnpaidWithoutVa(params: {
    createdBefore: Date;
    limit: number;
  }): Promise<Invoice[]>;
  /** UNPAID VA invoices past expiry, for reconciliation against the gateway. */
  findUnsettledVaInvoices(params: {
    dueBefore: Date;
    notBefore: Date;
    limit: number;
  }): Promise<Invoice[]>;
}
