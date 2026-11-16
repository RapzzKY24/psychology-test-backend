import { z } from 'zod';

/**
 * A certificate the buyer may read. `DRAFT` never appears (it has no number
 * yet) and `SUPERSEDED` is hidden because the revision that replaced it is
 * already in the list.
 */
export const MeCertificateItemSchema = z.object({
  id: z.string(),
  number: z.string(),
  testName: z.string(),
  issuedAt: z.date(),
  validUntil: z.date().nullable(),
  status: z.enum(['ACTIVE', 'REVOKED']),
  verifyCode: z.string().nullable(),
});

export type MeCertificateItemDto = z.infer<typeof MeCertificateItemSchema>;
