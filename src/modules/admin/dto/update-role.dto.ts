import { z } from 'zod';
import { UserRole } from '../../../generated/prisma/client';

export const UpdateRoleSchema = z.object({
  role: z.nativeEnum(UserRole),
});

export type UpdateRoleDto = z.infer<typeof UpdateRoleSchema>;
