import { z } from 'zod';
import { jakartaIsoDate } from '../../reports/utils/jakarta-date';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every field is optional because a draft is saved as the psychologist works
 * through the form. Completeness is enforced at publish, not here (spec D5).
 *
 * Gender is an enum rather than free text: this value is printed on a signed
 * document, so "Laki-Laki", "laki laki" and "L" must not all be reachable.
 */
export const CertificateIdentitySchema = z
  .object({
    fullName: z.string().trim().min(1).max(120).optional(),
    idNumber: z.string().trim().min(1).max(40).optional(),
    gender: z.enum(['LAKI_LAKI', 'PEREMPUAN']).optional(),
    birthPlace: z.string().trim().min(1).max(80).optional(),
    birthDate: z.string().regex(ISO_DATE, 'expected_iso_date').optional(),
    age: z.number().int().min(0).max(150).optional(),
    address: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

export const UpdateCertificateSchema = z
  .object({
    identity: CertificateIdentitySchema.optional(),
    verdict: z
      .enum(['MEMENUHI_SYARAT', 'TIDAK_MEMENUHI_SYARAT'])
      .nullable()
      .optional(),
    purpose: z.string().trim().min(3).max(200).nullable().optional(),
    /**
     * A calendar day, not an instant. Compared as an ISO string so a server in
     * another timezone cannot reject a date that is still valid in Jakarta.
     */
    validUntil: z
      .string()
      .regex(ISO_DATE, 'expected_iso_date')
      .refine((value) => value > jakartaIsoDate(new Date()), {
        message: 'valid_until_must_be_in_the_future',
      })
      .nullable()
      .optional(),
  })
  .strict();

export type UpdateCertificateDto = z.infer<typeof UpdateCertificateSchema>;
export type CertificateIdentityDto = z.infer<typeof CertificateIdentitySchema>;
