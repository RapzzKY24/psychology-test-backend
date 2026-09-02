import { z } from 'zod';

export const CreateInstitutionSchema = z.object({
  name: z.string().min(1).max(200),
  contactName: z.string().min(1).max(200),
  contactEmail: z.string().email(),
  phone: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
});

export type CreateInstitutionDto = z.infer<typeof CreateInstitutionSchema>;
