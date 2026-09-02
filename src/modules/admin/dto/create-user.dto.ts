import { z } from 'zod';

export const CreateUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  role: z.enum(['PARTICIPANT', 'ADMIN', 'PSYCHOLOGIST']),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
