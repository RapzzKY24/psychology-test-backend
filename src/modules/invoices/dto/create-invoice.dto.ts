import { z } from 'zod';

export const CreateInvoiceSchema = z.object({
  institutionId: z.string().uuid(),
  amount: z.number().int().min(1),
  dueDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
});

export type CreateInvoiceDto = z.infer<typeof CreateInvoiceSchema>;
