import { z } from 'zod';

export const JoinSessionSchema = z
  .object({
    name: z.string().min(1).max(200),
    email: z.string().email().optional(),
    phone: z.string().max(20).optional(),
    candidateNumber: z.string().max(50).optional(),
    pin: z.string().min(4).max(8).optional(),
    // Set when the FE confirms a name-only match (two-tier resume).
    confirmParticipantId: z.string().uuid().optional(),
  })
  .strict();

export type JoinSessionDto = z.infer<typeof JoinSessionSchema>;
