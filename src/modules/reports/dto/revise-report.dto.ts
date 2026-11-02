import { z } from 'zod';
import { RECOMMENDATION_VALUES } from '../rubric';

/** Admin correction after the report has been issued. */
export const ReviseReportSchema = z
  .object({
    ratings: z.record(z.string(), z.string()).optional(),
    narratives: z.record(z.string(), z.string()).optional(),
    recommendation: z.enum(RECOMMENDATION_VALUES).optional(),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();

export type ReviseReportDto = z.infer<typeof ReviseReportSchema>;

export const RevokeReportSchema = z
  .object({
    reason: z.string().trim().min(10).max(500),
  })
  .strict();

export type RevokeReportDto = z.infer<typeof RevokeReportSchema>;
