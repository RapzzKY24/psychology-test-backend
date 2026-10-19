import { z } from 'zod';

export const UpdateSessionSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    expiresAt: z.coerce
      .date()
      .refine((d) => d > new Date(), {
        message: 'expiresAt must be in the future',
      })
      .optional(),
  })
  .strict()
  .refine((v) => v.title !== undefined || v.expiresAt !== undefined, {
    message: 'at least one of title or expiresAt is required',
  });

export type UpdateSessionDto = z.infer<typeof UpdateSessionSchema>;
