import { z } from 'zod';

/**
 * Endpoint publik: token datang dari QR yang dipindai siapa saja, jadi
 * bentuknya divalidasi sebelum menyentuh DB.
 */
export const InvoiceVerificationParamSchema = z.object({
  verificationToken: z.string().uuid(),
});

export type InvoiceVerificationParamDto = z.infer<
  typeof InvoiceVerificationParamSchema
>;
