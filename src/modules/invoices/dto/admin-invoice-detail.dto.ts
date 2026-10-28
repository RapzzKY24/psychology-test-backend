import { z } from 'zod';
import {
  InvoiceStatus,
  PaymentVerifiedBySource,
} from '../../../generated/prisma/client';
import type { InvoiceDetailRow } from '../repository/invoices.repository';

/** What the admin invoice popup renders: who bought what, for how much. */
export const AdminInvoiceDetailSchema = z.object({
  id: z.string(),
  number: z.string(),
  status: z.nativeEnum(InvoiceStatus),
  amount: z.number().int(),
  issuedAt: z.string(),
  dueDate: z.string().nullable(),
  /** Payment window; null when the invoice never went to a gateway. */
  expiresAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  verifiedBySource: z.nativeEnum(PaymentVerifiedBySource).nullable(),
  paymentType: z.string().nullable(),
  notes: z.string().nullable(),
  institution: z.object({ id: z.string(), name: z.string() }).nullable(),
  session: z
    .object({
      id: z.string(),
      title: z.string(),
      slotLimit: z.number().int(),
      status: z.string(),
      testNames: z.array(z.string()),
    })
    .nullable(),
});

export type AdminInvoiceDetailDto = z.infer<typeof AdminInvoiceDetailSchema>;

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
