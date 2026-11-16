import { z } from 'zod';

/**
 * Only what the participant owns: the display name and the WhatsApp number.
 * Email is the login identity and the birth date is recorded per attempt, so
 * neither can be edited here.
 */
export const UpdateMeProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+\-\s()]*$/, 'phone_invalid')
    .nullable()
    .optional(),
});

export type UpdateMeProfileDto = z.infer<typeof UpdateMeProfileSchema>;
