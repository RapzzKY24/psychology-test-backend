import { z } from 'zod';

export const UpdateProfileSchema = z.object({
  fullName: z.string().trim().min(3).max(100),
  degree: z.string().trim().max(100),
  licenseNumber: z.string().trim().min(3).max(50),
  nik: z
    .string()
    .trim()
    .regex(/^\d{16}$/, 'nik must be 16 digits'),
  institutionName: z.string().trim().min(2).max(200),
});

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
