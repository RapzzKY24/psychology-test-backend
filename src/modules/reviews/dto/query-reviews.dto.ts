import { z } from 'zod';

export const QueryReviewsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  // APPROVED visible post-approval (dashboard history)
  status: z.enum(['PENDING_REVIEW', 'RETURNED', 'APPROVED']).optional(),
  sessionId: z.string().uuid().optional(),
  testId: z.string().uuid().optional(),
});

export type QueryReviewsDto = z.infer<typeof QueryReviewsSchema>;
