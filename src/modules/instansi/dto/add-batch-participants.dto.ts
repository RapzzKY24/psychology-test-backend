import { z } from 'zod';

export const AddBatchParticipantsSchema = z
  .object({
    employeeIds: z
      .array(z.string().uuid())
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'employeeIds must be unique',
      }),
  })
  .strict();

export type AddBatchParticipantsDto = z.infer<
  typeof AddBatchParticipantsSchema
>;
