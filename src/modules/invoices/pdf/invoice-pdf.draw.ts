import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import {
  DANGER,
  GRAY,
  LIGHT,
  LINE,
  MARGIN,
  NAVY,
  RIGHT,
  formatDate,
  formatRupiah,
  rightAlign,
  wrapText,
} from './invoice-pdf.layout';
import type { InvoicePdfInput } from './invoice-pdf.types';

export function drawItems(
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

export function drawTotal(
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

export function drawPaymentBand(
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

export function drawNotes(
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

export function drawFooter(page: PDFPage, fonts: { regular: PDFFont }): void {
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
