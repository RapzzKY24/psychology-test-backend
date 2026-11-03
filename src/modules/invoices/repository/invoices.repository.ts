import type {
  Invoice,
  PaymentProvider,
  PaymentVerifiedBySource,
  Prisma,
} from '../../../generated/prisma/client';
import type { CreatePaymentCustomer } from '../../payments/gateway/payment-gateway.interface';

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

/** Everything the admin detail popup shows, in one query. */
export interface InvoiceDetailRow {
  invoice: Invoice;
  institution: { id: string; name: string } | null;
  session: {
    id: string;
    title: string;
    slotLimit: number;
    status: string;
    testNames: string[];
  } | null;
}

/** Public verification payload. Never carries payment tokens or notes. */
export interface InvoiceVerificationRow {
  number: string;
  amount: number;
  status: Invoice['status'];
  issuedAt: Date;
  dueDate: Date | null;
  verifiedAt: Date | null;
  vaNumber: string | null;
  vaBankCode: string | null;
  institution: { name: string } | null;
}

/** Everything the PDF renderer needs for one invoice. */
export interface InvoicePdfRow {
  number: string;
  amount: number;
  status: Invoice['status'];
  issuedAt: Date;
  dueDate: Date | null;
  verifiedAt: Date | null;
  notes: string | null;
  verificationToken: string;
  vaNumber: string | null;
  vaBankCode: string | null;
  institution: {
    name: string;
    address: string | null;
    contactEmail: string;
  } | null;
  session: { title: string; slotLimit: number } | null;
}

export interface InvoicesRepository {
  findById(id: string): Promise<Invoice | null>;
  /**
   * Institution contact for the gateway's customer block. Doku requires an
   * email; Snap ignores it. Null when the invoice has no institution.
   */
  findBillingContact(invoiceId: string): Promise<CreatePaymentCustomer | null>;
  /** Public QR lookup. Returns only fields the verification page may show. */
  findByVerificationToken(
    token: string,
  ): Promise<InvoiceVerificationRow | null>;
  /**
   * Invoice shaped for the PDF renderer. Pass `institutionId` to scope the
   * lookup to one institution (instansi download); omit it for admin.
   */
  findForPdf(params: {
    id: string;
    institutionId?: string;
  }): Promise<InvoicePdfRow | null>;
  /** Invoice with its institution and the tests bought with it (admin detail). */
  findDetailById(id: string): Promise<InvoiceDetailRow | null>;
  /**
   * Invoice resolved by its own id or by `providerOrderId` (the id Snap echoes
   * back), restricted to invoices whose institution belongs to `ownerUserId`.
   * Also returns the session's test names for the checkout result page.
   */
  findOwnedByRef(
    ref: string,
    ownerUserId: string,
  ): Promise<{ invoice: Invoice; testNames: string[] } | null>;
  findMany(params: {
    where: Prisma.InvoiceWhereInput;
    skip: number;
    take: number;
    orderBy?: Prisma.InvoiceOrderByWithRelationInput;
  }): Promise<{ data: Invoice[]; total: number }>;
  /**
   * An institution's invoices for the payment list, unpaid first, with the
   * batch title and seat count so the row can be rendered without a second
   * request. Ordering leans on the Postgres enum ordinal (UNPAID < PAID <
   * CANCELLED).
   */
  findByInstitution(params: {
    institutionId: string;
    skip: number;
    take: number;
  }): Promise<{
    data: Array<
      Invoice & { session: { title: string; slotLimit: number } | null }
    >;
    total: number;
  }>;
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
  /**
   * `providerOrderId` is the only key the gateway echoes back on a
   * notification, so this is the lookup used by the notification handler.
   */
  findByProviderOrderId(providerOrderId: string): Promise<Invoice | null>;
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
  /** UNPAID `provider` invoices with no provider order id yet (recovery). */
  findUnpaidWithoutProviderOrderId(params: {
    provider: PaymentProvider;
    createdBefore: Date;
    limit: number;
  }): Promise<Invoice[]>;
  /**
   * UNPAID `provider` invoices due for a gateway status check: older than the
   * staleness window (webhook may have been lost) and not older than the
   * lookback. Open invoices are included — waiting for `expiresAt` left a
   * 24-hour blind spot.
   */
  findUnsettledInvoices(params: {
    provider: PaymentProvider;
    createdBefore: Date;
    notBefore: Date;
    limit: number;
  }): Promise<Invoice[]>;
}
