import { z } from 'zod';

export const QueryResultsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sessionId: z.string().uuid().optional(),
  status: z.enum(['PENDING_REVIEW', 'APPROVED', 'RETURNED']).optional(),
});

export type QueryResultsDto = z.infer<typeof QueryResultsSchema>;
