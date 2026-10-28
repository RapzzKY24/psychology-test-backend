import { z } from 'zod';
import type { InvoiceVerificationRow } from '../repository/invoices.repository';

/**
 * Bentuk data yang boleh keluar dari endpoint verifikasi publik.
 * Sengaja sempit: tidak ada paymentToken, paymentUrl, notes, atau email kontak.
 */
export const PublicInvoiceVerificationSchema = z.object({
  number: z.string(),
  institutionName: z.string(),
  amount: z.number().int(),
  status: z.enum(['UNPAID', 'PAID', 'CANCELLED']),
  issuedAt: z.coerce.date(),
  dueDate: z.coerce.date().nullable(),
  /** Diisi hanya saat invoice sudah lunas. */
  paidAt: z.coerce.date().nullable(),
  /** Nomor VA disembunyikan begitu invoice tidak lagi menunggu pembayaran. */
  payment: z
    .object({
      bank: z.string(),
      vaNumber: z.string(),
    })
    .nullable(),
});

export type PublicInvoiceVerificationDto = z.infer<
  typeof PublicInvoiceVerificationSchema
>;

export function toPublicInvoiceVerification(
  row: InvoiceVerificationRow,
): PublicInvoiceVerificationDto {
  const isUnpaid = row.status === 'UNPAID';
  const hasVa = row.vaNumber !== null && row.vaBankCode !== null;

  return {
    number: row.number,
    institutionName: row.institution?.name ?? '-',
    amount: row.amount,
    status: row.status,
    issuedAt: row.issuedAt,
    dueDate: row.dueDate,
    paidAt: row.status === 'PAID' ? row.verifiedAt : null,
    payment:
      isUnpaid && hasVa
        ? { bank: row.vaBankCode as string, vaNumber: row.vaNumber as string }
        : null,
  };
}
