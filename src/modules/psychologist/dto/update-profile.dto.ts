import { z } from 'zod';

export const UpdateProfileSchema = z.object({
  fullName: z.string().min(3).max(100),
  degree: z.string().min(2).max(100),
  licenseNumber: z.string().min(3).max(50),
});

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
