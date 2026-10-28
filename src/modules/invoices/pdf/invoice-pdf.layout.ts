import { readFile } from 'node:fs/promises';
import { rgb } from 'pdf-lib';
import type { PDFDocument, PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import type { InvoicePdfInput } from './invoice-pdf.types';

export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 51;
export const RIGHT = PAGE_WIDTH - MARGIN;

export const NAVY = rgb(0.05, 0.09, 0.16);
export const GRAY = rgb(0.45, 0.45, 0.47);
export const LIGHT = rgb(0.96, 0.96, 0.97);
export const LINE = rgb(0.85, 0.86, 0.88);
export const DANGER = rgb(0.72, 0.11, 0.11);

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

export function formatRupiah(amount: number): string {
  return `Rp${new Intl.NumberFormat('id-ID').format(amount)}`;
}

export function formatDate(value: Date): string {
  return DATE_FORMAT.format(value);
}

export function wrapText(
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

export function rightAlign(text: string, font: PDFFont, size: number): number {
  return RIGHT - font.widthOfTextAtSize(text, size);
}

export async function embedLogo(
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

export function drawHeader(
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

export function drawBillTo(
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
