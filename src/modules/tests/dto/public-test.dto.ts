import { z } from 'zod';

/** Public-safe test fields (docs/features/07-payments.md req 9). */
export const PublicTestSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  /** Cover image path; null when the admin has not uploaded one. */
  imageUrl: z.string().nullable(),
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
