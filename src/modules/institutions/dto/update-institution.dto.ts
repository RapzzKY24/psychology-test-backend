import { z } from 'zod';

export const UpdateInstitutionSchema = z
  .object({
    name: z.string().min(1).max(200),
    contactName: z.string().min(1).max(200),
    contactEmail: z.string().email(),
    phone: z.string().max(50).nullable(),
    notes: z.string().max(2000).nullable(),
  })
  .partial();

export type UpdateInstitutionDto = z.infer<typeof UpdateInstitutionSchema>;
