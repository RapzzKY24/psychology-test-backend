/** Semua yang dibutuhkan renderer. Tanggal sudah dalam bentuk Date (UTC). */
export interface InvoicePdfInput {
  number: string;
  amount: number;
  status: 'UNPAID' | 'PAID' | 'CANCELLED';
  issuedAt: Date;
  dueDate: Date | null;
  paidAt: Date | null;
  notes: string | null;
  verificationToken: string;
  vaNumber: string | null;
  vaBankCode: string | null;
  institution: {
    name: string;
    address: string | null;
    contactEmail: string;
  } | null;
  session: { title: string; slotLimit: number } | null;
  /** Basis URL publik, mis. https://psikologitest.id — dipakai menyusun QR. */
  publicUrl: string;
  /** Path absolut ke logo. Kalau tidak ada, PDF tetap terbit tanpa logo. */
  logoPath?: string;
}
