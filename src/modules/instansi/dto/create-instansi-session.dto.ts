import { z } from 'zod';

export const CreateInstansiSessionSchema = z
  .object({
    testIds: z
      .array(z.string().uuid())
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'testIds must be unique',
      }),
    slotLimit: z.number().int().min(1).max(1000),
    employeeIds: z
      .array(z.string().uuid())
      .max(1000)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'employeeIds must be unique',
      })
      .default([]),
  })
  .strict();

export type CreateInstansiSessionDto = z.infer<
  typeof CreateInstansiSessionSchema
>;
