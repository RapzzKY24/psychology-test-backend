import { z } from 'zod';

/** Roster claim: pick a pre-created participant row, get a token for it. */
export const ClaimSessionSchema = z
  .object({
    participantId: z.string().uuid(),
  })
  .strict();

export type ClaimSessionDto = z.infer<typeof ClaimSessionSchema>;
