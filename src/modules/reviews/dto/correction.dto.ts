import { z } from 'zod';

export const CorrectionSchema = z.object({
  scores: z.record(z.string(), z.unknown()),
  patternCode: z.string().min(1),
  reason: z.string().min(10).max(2000),
});

export type CorrectionDto = z.infer<typeof CorrectionSchema>;
