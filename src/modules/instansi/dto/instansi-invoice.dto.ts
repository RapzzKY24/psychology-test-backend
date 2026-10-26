import { z } from 'zod';
import type { Invoice } from '../../../generated/prisma/client';

export const InstansiInvoiceSchema = z.object({
  id: z.string(),
  number: z.string(),
  amount: z.number().int(),
  status: z.enum(['UNPAID', 'PAID', 'CANCELLED']),
  sessionId: z.string().nullable(),
  /** Batch title — null when the invoice is not tied to a session. */
  sessionTitle: z.string().nullable(),
  /** Seats bought in the batch (the roster's slot limit). */
  slotLimit: z.number().int().nullable(),
  vaNumber: z.string().nullable(),
  vaBankCode: z.string().nullable(),
  /** Hosted payment page (Snap). Null for VA and manual providers. */
  paymentUrl: z.string().nullable(),
  /** Snap token for the embedded popup. Null for VA and manual providers. */
  paymentToken: z.string().nullable(),
  expiresAt: z.coerce.date().nullable(),
});

export type InstansiInvoiceDto = z.infer<typeof InstansiInvoiceSchema>;

/** The session columns the payment list needs, nothing more. */
export interface InstansiInvoiceSession {
  title: string;
  slotLimit: number;
}

export function toInstansiInvoice(
  invoice: Invoice,
  session: InstansiInvoiceSession | null = null,
): InstansiInvoiceDto {
  return {
    id: invoice.id,
    number: invoice.number,
    amount: invoice.amount,
    status: invoice.status,
    sessionId: invoice.sessionId,
    sessionTitle: session?.title ?? null,
    slotLimit: session?.slotLimit ?? null,
    vaNumber: invoice.vaNumber,
    vaBankCode: invoice.vaBankCode,
    paymentUrl: invoice.paymentUrl,
    paymentToken: invoice.paymentToken,
    expiresAt: invoice.expiresAt,
  };
}

/** Invoice row joined with its session (list endpoint). */
export function toInstansiInvoiceRow(
  row: Invoice & { session: InstansiInvoiceSession | null },
): InstansiInvoiceDto {
  const { session, ...invoice } = row;
  return toInstansiInvoice(invoice, session);
}
