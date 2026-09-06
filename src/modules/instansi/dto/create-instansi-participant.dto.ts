import { z } from 'zod';

export const CreateInstansiParticipantSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    destinationCountry: z.string().trim().min(1).max(100),
    idType: z.enum(['NIK', 'PASPOR']),
    idNumber: z.string().trim().min(1).max(50),
    birthDate: z.string().datetime().optional(),
    phone: z.string().trim().max(20).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const UpdateInstansiParticipantSchema =
  CreateInstansiParticipantSchema.omit({
    idNumber: true,
  }).partial();

export type CreateInstansiParticipantDto = z.infer<
  typeof CreateInstansiParticipantSchema
>;
export type UpdateInstansiParticipantDto = z.infer<
  typeof UpdateInstansiParticipantSchema
>;
