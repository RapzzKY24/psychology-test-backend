import { z } from 'zod';
import type { Invoice } from '../../../generated/prisma/client';

export const InstansiInvoiceSchema = z.object({
  id: z.string(),
  number: z.string(),
  amount: z.number().int(),
  status: z.enum(['UNPAID', 'PAID', 'CANCELLED']),
  sessionId: z.string().nullable(),
  vaNumber: z.string().nullable(),
  vaBankCode: z.string().nullable(),
  /** Hosted payment page (Snap). Null for VA and manual providers. */
  paymentUrl: z.string().nullable(),
  /** Snap token for the embedded popup. Null for VA and manual providers. */
  paymentToken: z.string().nullable(),
  expiresAt: z.coerce.date().nullable(),
});

export type InstansiInvoiceDto = z.infer<typeof InstansiInvoiceSchema>;

export function toInstansiInvoice(invoice: Invoice): InstansiInvoiceDto {
  return {
    id: invoice.id,
    number: invoice.number,
    amount: invoice.amount,
    status: invoice.status,
    sessionId: invoice.sessionId,
    vaNumber: invoice.vaNumber,
    vaBankCode: invoice.vaBankCode,
    paymentUrl: invoice.paymentUrl,
    paymentToken: invoice.paymentToken,
    expiresAt: invoice.expiresAt,
  };
}
