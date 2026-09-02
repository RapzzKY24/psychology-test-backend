import { z } from 'zod';

export const DiscItemContentSchema = z.object({
  words: z.array(z.string().min(1)).length(4),
  mapping: z.array(z.enum(['D', 'I', 'S', 'C'])).length(4),
});

export type DiscItemContent = z.infer<typeof DiscItemContentSchema>;

export const DiscResponseSchema = z
  .object({
    most: z.number().int().min(0).max(3),
    least: z.number().int().min(0).max(3),
  })
  .refine((v) => v.most !== v.least, {
    message: 'most and least must be different',
  });

export type DiscResponse = z.infer<typeof DiscResponseSchema>;

export const DISC_PATTERN_CATALOG = [
  'D',
  'I',
  'S',
  'C',
  'DI',
  'DC',
  'ID',
  'IS',
  'SI',
  'SC',
  'CD',
  'CS',
  'ISC',
] as const;
