import { z } from 'zod';
import type { Invoice } from '../../../generated/prisma/client';

export const InstansiInvoiceSchema = z.object({
  id: z.string(),
  number: z.string(),
  amount: z.number().int(),
  status: z.enum(['UNPAID', 'PAID', 'CANCELLED']),
  vaNumber: z.string().nullable(),
  vaBankCode: z.string().nullable(),
  expiresAt: z.coerce.date().nullable(),
});

export type InstansiInvoiceDto = z.infer<typeof InstansiInvoiceSchema>;

export function toInstansiInvoice(invoice: Invoice): InstansiInvoiceDto {
  return {
    id: invoice.id,
    number: invoice.number,
    amount: invoice.amount,
    status: invoice.status,
    vaNumber: invoice.vaNumber,
    vaBankCode: invoice.vaBankCode,
    expiresAt: invoice.expiresAt,
  };
}
