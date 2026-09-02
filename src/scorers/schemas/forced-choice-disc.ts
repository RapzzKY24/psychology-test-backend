import { z } from 'zod';

export const DiscItemContentSchema = z.object({
  words: z.array(z.string().min(1)).length(4),
  mapping: z.array(z.enum(['D', 'I', 'S', 'C'])).length(4),
});

export type DiscItemContent = z.infer<typeof DiscItemContentSchema>;

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
