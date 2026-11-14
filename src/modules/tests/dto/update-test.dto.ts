import { z } from 'zod';
import { ScorerTypeValues } from '../../../scorers/schemas';
import { NormTableSchema } from '../../../scorers/schemas/right-wrong-norm';

export const UpdateTestSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  description: z.string().min(10).optional(),
  price: z.number().int().min(0).optional(),
  estimatedDurationMin: z.number().int().min(1).optional(),
  /**
   * Hard limit enforced server-side from `startedAt`; `null` removes it.
   * `estimatedDurationMin` stays catalog copy.
   */
  timeLimitMin: z.number().int().min(1).max(240).nullable().optional(),
  /** Raw -> IQ rows; `null` removes the norm. */
  normTable: NormTableSchema.nullable().optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  /**
   * Switchable only while the test is DRAFT and has no items — the item schema
   * changes with the scorer, so existing rows would become invalid.
   */
  scorerType: z.enum(ScorerTypeValues).optional(),
  /**
   * Only paths produced by the cover upload endpoint — never an external URL,
   * and `null` clears the cover.
   */
  imageUrl: z
    .string()
    .startsWith('/uploads/test-covers/')
    .nullable()
    .optional(),
});

export type UpdateTestDto = z.infer<typeof UpdateTestSchema>;
