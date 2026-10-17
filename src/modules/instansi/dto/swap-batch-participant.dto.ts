import { z } from 'zod';

export const SwapBatchParticipantSchema = z
  .object({
    employeeId: z.string().uuid(),
  })
  .strict();

export type SwapBatchParticipantDto = z.infer<
  typeof SwapBatchParticipantSchema
>;
