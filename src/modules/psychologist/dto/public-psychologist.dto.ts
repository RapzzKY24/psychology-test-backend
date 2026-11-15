import { z } from 'zod';

/**
 * What the public site may show about a psychologist.
 *
 * Mirrors the signature block of the report — the same four credentials a
 * reader can check on the printed document. `nik` and `signatureImagePath`
 * never leave the server.
 */
export const PublicPsychologistSchema = z.object({
  fullName: z.string(),
  degree: z.string(),
  /** STR/SIK — the registration number printed under the signature. */
  licenseNumber: z.string(),
  /** SIPP/SIPPK; null on profiles created before the field existed. */
  sippNumber: z.string().nullable(),
  institutionName: z.string().nullable(),
});

export type PublicPsychologistDto = z.infer<typeof PublicPsychologistSchema>;
