import { z } from 'zod';

export const ReviewStatsQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(30).default(14),
});

export type ReviewStatsQueryDto = z.infer<typeof ReviewStatsQuerySchema>;

export const DailyIncomingSchema = z.object({
  /** `YYYY-MM-DD` in Asia/Jakarta. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().nonnegative(),
});

export const ReviewStatsSchema = z.object({
  incoming: z.array(DailyIncomingSchema),
  mine: z.object({
    approved7d: z.number().int().nonnegative(),
    returned7d: z.number().int().nonnegative(),
  }),
  queueNow: z.number().int().nonnegative(),
});

export type ReviewStats = z.infer<typeof ReviewStatsSchema>;
