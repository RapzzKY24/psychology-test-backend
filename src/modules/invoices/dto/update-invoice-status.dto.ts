import { z } from 'zod';

export const UpdateInvoiceStatusSchema = z.object({
  status: z.enum(['UNPAID', 'PAID', 'CANCELLED']),
  notes: z.string().max(2000).optional(),
});

export type UpdateInvoiceStatusDto = z.infer<typeof UpdateInvoiceStatusSchema>;
