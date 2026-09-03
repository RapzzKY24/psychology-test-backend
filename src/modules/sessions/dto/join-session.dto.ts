import { z } from 'zod';

export const JoinSessionSchema = z
  .object({
    name: z.string().min(1).max(200),
    email: z.string().email().optional(),
    candidateNumber: z.string().max(50).optional(),
    pin: z.string().min(4).max(8).optional(),
  })
  .strict();

export type JoinSessionDto = z.infer<typeof JoinSessionSchema>;
