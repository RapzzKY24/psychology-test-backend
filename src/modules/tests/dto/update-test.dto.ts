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
});

export type UpdateTestDto = z.infer<typeof UpdateTestSchema>;
