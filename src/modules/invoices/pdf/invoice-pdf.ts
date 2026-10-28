import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import type { InvoicePdfInput } from './invoice-pdf.types';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 51;
const RIGHT = PAGE_WIDTH - MARGIN;

const NAVY = rgb(0.05, 0.09, 0.16);
const GRAY = rgb(0.45, 0.45, 0.47);
const LIGHT = rgb(0.96, 0.96, 0.97);
const LINE = rgb(0.85, 0.86, 0.88);
const DANGER = rgb(0.72, 0.11, 0.11);

const DATE_FORMAT = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});

const STATUS_LABEL: Record<InvoicePdfInput['status'], string> = {
  UNPAID: 'Belum Dibayar',
  PAID: 'Lunas',
  CANCELLED: 'Dibatalkan',
};

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

function formatRupiah(amount: number): string {
  return `Rp${new Intl.NumberFormat('id-ID').format(amount)}`;
}

function formatDate(value: Date): string {
  return DATE_FORMAT.format(value);
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = candidate;
    }
  }

  if (lines.length < maxLines && current) lines.push(current);
  return lines;
}

function rightAlign(text: string, font: PDFFont, size: number): number {
  return RIGHT - font.widthOfTextAtSize(text, size);
}

async function embedLogo(
  doc: PDFDocument,
  logoPath: string | undefined,
): Promise<PDFImage | null> {
  if (!logoPath) return null;
  try {
    return await doc.embedJpg(await readFile(logoPath));
  } catch {
    // Logo hilang tidak boleh menggagalkan penerbitan invoice.
    return null;
  }
}

function drawHeader(
  page: PDFPage,
  input: InvoicePdfInput,
  fonts: { bold: PDFFont; regular: PDFFont },
  logo: PDFImage | null,
): number {
  const top = PAGE_HEIGHT - MARGIN;

  if (logo) {
    const height = 38;
    const width = (logo.width / logo.height) * height;
    page.drawImage(logo, { x: MARGIN, y: top - height, width, height });
  }

  const title = 'INVOICE';
  page.drawText(title, {
    x: rightAlign(title, fonts.bold, 22),
    y: top - 18,
    size: 22,
    font: fonts.bold,
    color: NAVY,
  });

  page.drawText(input.number, {
    x: rightAlign(input.number, fonts.bold, 11),
    y: top - 38,
    size: 11,
    font: fonts.bold,
    color: NAVY,
  });

  const issued = formatDate(input.issuedAt);
  page.drawText(issued, {
    x: rightAlign(issued, fonts.regular, 9),
    y: top - 53,
    size: 9,
    font: fonts.regular,
    color: GRAY,
  });

  const lineY = top - 66;
  page.drawLine({
    start: { x: MARGIN, y: lineY },
    end: { x: RIGHT, y: lineY },
    thickness: 1,
    color: LINE,
  });

  return lineY;
}

function drawBillTo(
  page: PDFPage,
  input: InvoicePdfInput,
  fonts: { bold: PDFFont; regular: PDFFont },
  startY: number,
): number {
  const label = 'DITAGIHKAN KEPADA';
  page.drawText(label, {
    x: MARGIN,
    y: startY,
    size: 8,
    font: fonts.bold,
    color: GRAY,
  });

  const name = input.institution?.name ?? '-';
  page.drawText(name, {
    x: MARGIN,
    y: startY - 16,
    size: 12,
    font: fonts.bold,
    color: NAVY,
  });

  let y = startY - 32;
  const details = [input.institution?.address, input.institution?.contactEmail]
    .filter((value): value is string => Boolean(value && value.trim()))
    .flatMap((value) => wrapText(value, fonts.regular, 9, 240, 2));

  for (const detail of details) {
    page.drawText(detail, {
      x: MARGIN,
      y,
      size: 9,
      font: fonts.regular,
      color: GRAY,
    });
    y -= 12;
  }

  const statusLabel = 'STATUS';
  page.drawText(statusLabel, {
    x: rightAlign(statusLabel, fonts.bold, 8),
    y: startY,
    size: 8,
    font: fonts.bold,
    color: GRAY,
  });

  const status = STATUS_LABEL[input.status];
  const statusFont = fonts.bold;
  page.drawText(status, {
    x: rightAlign(status, statusFont, 11),
    y: startY - 16,
    size: 11,
    font: statusFont,
    color: input.status === 'CANCELLED' ? DANGER : NAVY,
  });

  return y;
}

function drawItems(
  page: PDFPage,
  input: InvoicePdfInput,
  fonts: { bold: PDFFont; regular: PDFFont },
  topY: number,
): number {
  const rowHeight = 30;

  page.drawRectangle({
    x: MARGIN,
    y: topY - 16,
    width: RIGHT - MARGIN,
    height: 18,
    color: LIGHT,
  });

  page.drawText('DESKRIPSI', {
    x: MARGIN + 6,
    y: topY - 10,
    size: 8,
    font: fonts.bold,
    color: GRAY,
  });

  const amountLabel = 'JUMLAH';
  page.drawText(amountLabel, {
    x: rightAlign(amountLabel, fonts.bold, 8) - 6,
    y: topY - 10,
    size: 8,
    font: fonts.bold,
    color: GRAY,
  });

  const seats = input.session?.slotLimit ?? 1;
  const description = `Paket sesi — ${seats} peserta`;

  page.drawText(description, {
    x: MARGIN + 6,
    y: topY - 34,
    size: 10,
    font: fonts.regular,
    color: NAVY,
  });

  if (input.session?.title) {
    const titleLines = wrapText(input.session.title, fonts.regular, 8, 330, 1);
    if (titleLines[0]) {
      page.drawText(titleLines[0], {
        x: MARGIN + 6,
        y: topY - 45,
        size: 8,
        font: fonts.regular,
        color: GRAY,
      });
    }
  }

  const amount = formatRupiah(input.amount);
  page.drawText(amount, {
    x: rightAlign(amount, fonts.regular, 10) - 6,
    y: topY - 34,
    size: 10,
    font: fonts.regular,
    color: NAVY,
  });

  const bottom = topY - 16 - rowHeight - 6;
  page.drawLine({
    start: { x: MARGIN, y: bottom },
    end: { x: RIGHT, y: bottom },
    thickness: 1,
    color: LINE,
  });

  return bottom;
}

function drawTotal(
  page: PDFPage,
  input: InvoicePdfInput,
  fonts: { bold: PDFFont; regular: PDFFont },
  topY: number,
): number {
  const label = 'TOTAL';
  const total = formatRupiah(input.amount);

  page.drawLine({
    start: { x: RIGHT - 200, y: topY },
    end: { x: RIGHT, y: topY },
    thickness: 1.5,
    color: NAVY,
  });

  page.drawText(label, {
    x: RIGHT - 200,
    y: topY - 16,
    size: 8,
    font: fonts.bold,
    color: GRAY,
  });

  page.drawText(total, {
    x: rightAlign(total, fonts.bold, 14),
    y: topY - 18,
    size: 14,
    font: fonts.bold,
    color: NAVY,
  });

  return topY - 34;
}

function drawPaymentBand(
  page: PDFPage,
  input: InvoicePdfInput,
  fonts: { bold: PDFFont; regular: PDFFont },
  qr: PDFImage,
): void {
  const boxY = 118;
  const boxWidth = 250;
  const boxHeight = 62;

  page.drawRectangle({
    x: MARGIN,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    color: LIGHT,
    borderColor: LINE,
    borderWidth: 1,
  });

  if (input.status === 'UNPAID' && input.vaNumber && input.vaBankCode) {
    page.drawText('PEMBAYARAN', {
      x: MARGIN + 12,
      y: boxY + boxHeight - 18,
      size: 8,
      font: fonts.bold,
      color: GRAY,
    });

    page.drawText(`${input.vaBankCode} — ${input.vaNumber}`, {
      x: MARGIN + 12,
      y: boxY + boxHeight - 34,
      size: 11,
      font: fonts.bold,
      color: NAVY,
    });

    const due = input.dueDate
      ? `Jatuh tempo: ${formatDate(input.dueDate)}`
      : 'Jatuh tempo: —';
    page.drawText(due, {
      x: MARGIN + 12,
      y: boxY + 12,
      size: 8,
      font: fonts.regular,
      color: GRAY,
    });
  } else if (input.status === 'PAID') {
    page.drawText('PEMBAYARAN', {
      x: MARGIN + 12,
      y: boxY + boxHeight - 18,
      size: 8,
      font: fonts.bold,
      color: GRAY,
    });

    page.drawText('Lunas', {
      x: MARGIN + 12,
      y: boxY + boxHeight - 36,
      size: 12,
      font: fonts.bold,
      color: NAVY,
    });

    if (input.paidAt) {
      page.drawText(`Dibayar ${formatDate(input.paidAt)}`, {
        x: MARGIN + 12,
        y: boxY + 12,
        size: 8,
        font: fonts.regular,
        color: GRAY,
      });
    }
  } else {
    page.drawText('DOKUMEN DIBATALKAN', {
      x: MARGIN + 12,
      y: boxY + boxHeight - 18,
      size: 8,
      font: fonts.bold,
      color: DANGER,
    });

    page.drawText('Invoice ini tidak berlaku.', {
      x: MARGIN + 12,
      y: boxY + boxHeight - 36,
      size: 10,
      font: fonts.regular,
      color: DANGER,
    });
  }

  const qrSize = 80;
  const qrX = RIGHT - qrSize;
  page.drawImage(qr, { x: qrX, y: boxY + 8, width: qrSize, height: qrSize });

  const caption = 'Scan untuk verifikasi keaslian dokumen';
  page.drawText(caption, {
    x: RIGHT - fonts.regular.widthOfTextAtSize(caption, 7),
    y: boxY - 4,
    size: 7,
    font: fonts.regular,
    color: GRAY,
  });
}

function drawNotes(
  page: PDFPage,
  input: InvoicePdfInput,
  fonts: { bold: PDFFont; regular: PDFFont },
  topY: number,
): number {
  if (!input.notes || !input.notes.trim()) return topY;

  const lines = wrapText(input.notes, fonts.regular, 9, RIGHT - MARGIN - 20, 3);
  const height = 24 + lines.length * 12;

  page.drawRectangle({
    x: MARGIN,
    y: topY - height,
    width: RIGHT - MARGIN,
    height,
    color: LIGHT,
    borderColor: LINE,
    borderWidth: 1,
  });

  page.drawText('CATATAN', {
    x: MARGIN + 10,
    y: topY - 14,
    size: 8,
    font: fonts.bold,
    color: GRAY,
  });

  let y = topY - 28;
  for (const line of lines) {
    page.drawText(line, {
      x: MARGIN + 10,
      y,
      size: 9,
      font: fonts.regular,
      color: NAVY,
    });
    y -= 12;
  }

  return topY - height - 12;
}

function drawFooter(page: PDFPage, fonts: { regular: PDFFont }): void {
  const y = 74;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: RIGHT, y },
    thickness: 1,
    color: LINE,
  });

  const lines = [
    'Dokumen ini diterbitkan melalui sistem, tidak perlu tanda tangan basah.',
    'www.psikologitest.id',
  ];

  let cursor = y - 14;
  for (const line of lines) {
    page.drawText(line, {
      x: MARGIN,
      y: cursor,
      size: 8,
      font: fonts.regular,
      color: GRAY,
    });
    cursor -= 11;
  }
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
