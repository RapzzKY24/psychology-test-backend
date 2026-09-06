import { z } from 'zod';

export const CreateInstansiSessionSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    testIds: z
      .array(z.string().uuid())
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'testIds must be unique',
      }),
    employeeIds: z
      .array(z.string().uuid())
      .min(1)
      .max(1000)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'employeeIds must be unique',
      }),
    slotLimit: z.number().int().min(1).max(1000),
    expiresAt: z.coerce.date().refine((d) => d > new Date(), {
      message: 'expiresAt must be in the future',
    }),
    pin: z.string().min(4).max(8).optional(),
  })
  .strict();

export type CreateInstansiSessionDto = z.infer<
  typeof CreateInstansiSessionSchema
>;
