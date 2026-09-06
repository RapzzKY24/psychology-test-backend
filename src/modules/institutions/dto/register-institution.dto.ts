import { z } from 'zod';

/**
 * Registrasi mandiri institusi: akun role INSTANSI + row Institution
 * terhubung (ownerUserId). Password confirm divalidasi di FE.
 */
export const RegisterInstitutionSchema = z.object({
  companyName: z.string().trim().min(2).max(200),
  picName: z.string().trim().min(2).max(100),
  email: z.string().email(),
  phone: z.string().trim().min(5).max(20),
  address: z.string().trim().min(5).max(500),
  password: z.string().min(8).max(100),
});

export type RegisterInstitutionDto = z.infer<typeof RegisterInstitutionSchema>;
