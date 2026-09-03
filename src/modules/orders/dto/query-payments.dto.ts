import { z } from 'zod';

export const QueryPaymentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(['PENDING', 'PAID', 'EXPIRED', 'CANCELLED']).optional(),
  amount: z.coerce.number().int().min(0).optional(),
});

export type QueryPaymentsDto = z.infer<typeof QueryPaymentsSchema>;
