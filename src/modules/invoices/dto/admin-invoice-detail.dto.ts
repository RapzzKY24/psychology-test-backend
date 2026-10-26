import type {
  InvoiceStatus,
  PaymentVerifiedBySource,
} from '../../../generated/prisma/client';
import type { InvoiceDetailRow } from '../repository/invoices.repository';

/** What the admin invoice popup renders: who bought what, for how much. */
export interface AdminInvoiceDetailDto {
  id: string;
  number: string;
  status: InvoiceStatus;
  amount: number;
  issuedAt: string;
  dueDate: string | null;
  /** Payment window; null when the invoice never went to a gateway. */
  expiresAt: string | null;
  paidAt: string | null;
  verifiedBySource: PaymentVerifiedBySource | null;
  paymentType: string | null;
  notes: string | null;
  institution: { id: string; name: string } | null;
  session: {
    id: string;
    title: string;
    slotLimit: number;
    status: string;
    testNames: string[];
  } | null;
}

export function toAdminInvoiceDetail(
  row: InvoiceDetailRow,
): AdminInvoiceDetailDto {
  const { invoice } = row;
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    amount: invoice.amount,
    issuedAt: invoice.issuedAt.toISOString(),
    dueDate: invoice.dueDate?.toISOString() ?? null,
    expiresAt: invoice.expiresAt?.toISOString() ?? null,
    paidAt: invoice.verifiedAt?.toISOString() ?? null,
    verifiedBySource: invoice.verifiedBySource,
    paymentType: invoice.paymentType,
    notes: invoice.notes,
    institution: row.institution,
    session: row.session,
  };
}
