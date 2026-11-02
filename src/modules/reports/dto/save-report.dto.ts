import { z } from 'zod';
import { RECOMMENDATION_VALUES } from '../rubric';

/**
 * Shape only. Whether the keys are real rubric keys, whether a rating is one of
 * R/K/C/B/T and whether a narrative fits its box is decided by
 * `validateReportInput`, so both layers stay in one place.
 */
export const SaveReportSchema = z
  .object({
    ratings: z.record(z.string(), z.string()).optional(),
    narratives: z.record(z.string(), z.string()).optional(),
    recommendation: z.enum(RECOMMENDATION_VALUES).nullable().optional(),
  })
  .strict();

export type SaveReportDto = z.infer<typeof SaveReportSchema>;
