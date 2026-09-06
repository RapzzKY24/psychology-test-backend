import { z } from 'zod';

export const CreateSessionSchema = z
  .object({
    title: z.string().min(1).max(200),
    institutionId: z.string().uuid().optional(),
    testIds: z
      .array(z.string().uuid())
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'testIds must be unique',
      }),
    slotLimit: z.number().int().min(1).max(1000),
    expiresAt: z.coerce.date().refine((d) => d > new Date(), {
      message: 'expiresAt must be in the future',
    }),
    pin: z.string().min(4).max(8).optional(),
    // Roster sessions: pre-created participant rows; join becomes name-pick.
    roster: z
      .array(
        z.object({
          name: z.string().min(1).max(200),
          candidateNumber: z.string().max(50).optional(),
        }),
      )
      .max(1000)
      .optional(),
  })
  .strict();

export type CreateSessionDto = z.infer<typeof CreateSessionSchema>;
