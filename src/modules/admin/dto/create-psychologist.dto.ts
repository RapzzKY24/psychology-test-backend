import { z } from 'zod';

export const CreatePsychologistSchema = z.object({
  name: z.string().min(2).max(100),
  nik: z.string().regex(/^\d{16}$/, 'nik must be 16 digits'),
  institutionName: z.string().min(2).max(200),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

export type CreatePsychologistDto = z.infer<typeof CreatePsychologistSchema>;
