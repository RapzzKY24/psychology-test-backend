import { z } from 'zod';

export const ReturnReviewSchema = z.object({
  reason: z.string().min(10).max(2000),
});

export type ReturnReviewDto = z.infer<typeof ReturnReviewSchema>;
