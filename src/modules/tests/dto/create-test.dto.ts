import { z } from 'zod';

export const CreateTestSchema = z.object({
  name: z.string().min(3).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().min(10),
  category: z.enum([
    'PERSONALITY',
    'COGNITIVE',
    'WORK_STYLE',
    'INTEREST',
    'PROJECTIVE',
  ]),
  scorerType: z.enum(['FORCED_CHOICE_DISC', 'RIGHT_WRONG_NORM']),
  price: z.number().int().min(0),
  estimatedDurationMin: z.number().int().min(1),
});

export type CreateTestDto = z.infer<typeof CreateTestSchema>;
