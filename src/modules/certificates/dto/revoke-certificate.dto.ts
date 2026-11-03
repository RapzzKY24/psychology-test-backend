import { z } from 'zod';

/**
 * A revocation is permanent and public, so the reason is part of the record:
 * it is what a third party scanning the QR is shown.
 */
export const RevokeCertificateSchema = z
  .object({ reason: z.string().trim().min(10).max(500) })
  .strict();

export type RevokeCertificateDto = z.infer<typeof RevokeCertificateSchema>;
