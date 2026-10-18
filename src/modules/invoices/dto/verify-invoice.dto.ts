import { z } from 'zod';

export const VerifyInvoiceSchema = z.object({
  reason: z.string().min(5),
});

export type VerifyInvoiceDto = z.infer<typeof VerifyInvoiceSchema>;
