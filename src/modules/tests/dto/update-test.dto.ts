import { z } from 'zod';

export const UpdateTestSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  description: z.string().min(10).optional(),
  price: z.number().int().min(0).optional(),
  estimatedDurationMin: z.number().int().min(1).optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  /**
   * Switchable only while the test is DRAFT and has no items — the item schema
   * changes with the scorer, so existing rows would become invalid.
   */
  scorerType: z.enum(['FORCED_CHOICE_DISC', 'RIGHT_WRONG_NORM']).optional(),
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
