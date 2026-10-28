import { PDFDocument } from 'pdf-lib';
import {
  buildVerificationUrl,
  invoiceFileName,
  renderInvoicePdf,
} from '../pdf/invoice-pdf';
import type { InvoicePdfInput } from '../pdf/invoice-pdf.types';

const baseInput: InvoicePdfInput = {
  number: 'INV-2026-0001',
  amount: 1500000,
  status: 'UNPAID',
  issuedAt: new Date('2026-10-28T03:00:00.000Z'),
  dueDate: new Date('2026-11-04T03:00:00.000Z'),
  paidAt: null,
  notes: null,
  verificationToken: 'token-abc',
  vaNumber: '8808123456789012',
  vaBankCode: 'BCA',
  institution: {
    name: 'PT Contoh Sejahtera',
    address: 'Jl. Merdeka 1, Jakarta',
    contactEmail: 'hrd@contoh.test',
  },
  session: { title: 'DISC — PT Contoh', slotLimit: 20 },
  publicUrl: 'https://psikologitest.id',
};

describe('buildVerificationUrl', () => {
  it('builds an absolute URL from the public base', () => {
    expect(buildVerificationUrl('https://psikologitest.id', 'abc')).toBe(
      'https://psikologitest.id/validasi/abc',
    );
  });

  it('trims trailing slashes', () => {
    expect(buildVerificationUrl('https://psikologitest.id///', 'abc')).toBe(
      'https://psikologitest.id/validasi/abc',
    );
  });

  it('throws instead of emitting an unscannable relative QR', () => {
    expect(() => buildVerificationUrl('', 'abc')).toThrow('APP_PUBLIC_URL');
  });
});

describe('invoiceFileName', () => {
  it('replaces characters that break a filename', () => {
    expect(invoiceFileName('INV/2026/10/001')).toBe(
      'Invoice-INV-2026-10-001.pdf',
    );
  });
});

describe('renderInvoicePdf', () => {
  it('produces a single-page PDF', async () => {
    const bytes = await renderInvoicePdf(baseInput);

    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');

    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(1);
  });

  it('still renders when the invoice has no VA and no due date', async () => {
    const bytes = await renderInvoicePdf({
      ...baseInput,
      vaNumber: null,
      vaBankCode: null,
      dueDate: null,
    });

    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('renders a paid invoice without a session', async () => {
    const bytes = await renderInvoicePdf({
      ...baseInput,
      status: 'PAID',
      paidAt: new Date('2026-10-29T02:00:00.000Z'),
      session: null,
    });

    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(1);
  });

  it('refuses to render without a public URL', async () => {
    await expect(
      renderInvoicePdf({ ...baseInput, publicUrl: '' }),
    ).rejects.toThrow('APP_PUBLIC_URL');
  });
});
