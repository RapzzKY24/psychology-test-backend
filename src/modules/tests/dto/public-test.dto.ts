import { z } from 'zod';

/** Public-safe test fields (docs/features/07-payments.md req 9). */
export const PublicTestSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum([
    'PERSONALITY',
    'COGNITIVE',
    'WORK_STYLE',
    'INTEREST',
    'PROJECTIVE',
  ]),
  price: z.number().int(),
  estimatedDurationMin: z.number().int(),
});

export type PublicTestDto = z.infer<typeof PublicTestSchema>;
