import { PDFDocument, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';
import {
  PAGE_HEIGHT,
  PAGE_WIDTH,
  drawBillTo,
  drawHeader,
  embedLogo,
} from './invoice-pdf.layout';
import {
  drawFooter,
  drawItems,
  drawNotes,
  drawPaymentBand,
  drawTotal,
} from './invoice-pdf.draw';
import type { InvoicePdfInput } from './invoice-pdf.types';

/**
 * QR harus selalu absolut. URL relatif menghasilkan kode yang tidak bisa
 * dipindai dari kertas, jadi lebih baik gagal keras di sini.
 */
export function buildVerificationUrl(
  publicUrl: string,
  verificationToken: string,
): string {
  const base = publicUrl.trim().replace(/\/+$/, '');
  if (!base) {
    throw new Error(
      'APP_PUBLIC_URL belum diisi — QR verifikasi invoice tidak bisa dibuat.',
    );
  }
  return `${base}/validasi/${verificationToken}`;
}

/** Nomor invoice dipakai sebagai nama file; hanya karakter aman yang lolos. */
export function invoiceFileName(number: string): string {
  return `Invoice-${number.replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`;
}

export async function renderInvoicePdf(
  input: InvoicePdfInput,
): Promise<Uint8Array> {
  const verifyUrl = buildVerificationUrl(
    input.publicUrl,
    input.verificationToken,
  );

  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const logo = await embedLogo(doc, input.logoPath);
  const qrPng = await doc.embedPng(
    await QRCode.toBuffer(verifyUrl, { margin: 1, width: 320 }),
  );

  const headerBottom = drawHeader(page, input, fonts, logo);
  const billToBottom = drawBillTo(page, input, fonts, headerBottom - 24);
  const itemsBottom = drawItems(page, input, fonts, billToBottom - 18);
  const totalBottom = drawTotal(page, input, fonts, itemsBottom - 16);

  drawNotes(page, input, fonts, totalBottom - 16);
  drawPaymentBand(page, input, fonts, qrPng);
  drawFooter(page, fonts);

  return doc.save();
}
