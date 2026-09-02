import { z } from 'zod';

export const UpdateRoleSchema = z.object({
  role: z.enum(['PARTICIPANT', 'ADMIN', 'PSYCHOLOGIST']),
});

export type UpdateRoleDto = z.infer<typeof UpdateRoleSchema>;
