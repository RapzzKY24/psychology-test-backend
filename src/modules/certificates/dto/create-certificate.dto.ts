import { z } from 'zod';

/**
 * Shape only. Whether the result exists, is APPROVED and belongs to a test
 * that has a certificate at all is decided by the service, which needs the row.
 */
export const CreateCertificateSchema = z
  .object({ resultId: z.string().uuid() })
  .strict();

export type CreateCertificateDto = z.infer<typeof CreateCertificateSchema>;
