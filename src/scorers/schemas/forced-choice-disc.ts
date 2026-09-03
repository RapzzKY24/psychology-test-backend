import { z } from 'zod';

export const DiscItemContentSchema = z.object({
  words: z.array(z.string().min(1)).length(4),
  mostMapping: z.array(z.enum(['D', 'I', 'S', 'C', '*'])).length(4),
  leastMapping: z.array(z.enum(['D', 'I', 'S', 'C', '*'])).length(4),
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
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
  '31',
  '32',
  '33',
  '34',
  '35',
  '36',
  '37',
  '38',
  '39',
  '40',
] as const;
