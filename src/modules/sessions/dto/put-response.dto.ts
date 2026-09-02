import { z } from 'zod';

export const PutResponseSchema = z
  .object({
    itemId: z.string().min(1),
    value: z.unknown(),
  })
  .strict();

export type PutResponseDto = z.infer<typeof PutResponseSchema>;
