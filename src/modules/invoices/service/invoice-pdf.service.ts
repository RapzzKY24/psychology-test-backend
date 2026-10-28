import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INVOICES_REPOSITORY } from '../repository/invoices.repository';
import type { InvoicesRepository } from '../repository/invoices.repository';
import { invoiceFileName, renderInvoicePdf } from '../pdf/invoice-pdf';

export interface InvoicePdfFile {
  buffer: Buffer;
  filename: string;
}

/**
 * Satu renderer untuk dua pemakai: admin (arsip) dan instansi (unduh ulang).
 * Perbedaan keduanya hanya pada filter kepemilikan, bukan pada layout.
 */
@Injectable()
export class InvoicePdfService {
  constructor(
    @Inject(INVOICES_REPOSITORY)
    private readonly repo: InvoicesRepository,
    private readonly config: ConfigService,
  ) {}

  async render(params: {
    id: string;
    institutionId?: string;
  }): Promise<InvoicePdfFile> {
    const row = await this.repo.findForPdf(params);
    if (!row) throw new NotFoundException('Invoice not found');

    const bytes = await renderInvoicePdf({
      ...row,
      paidAt: row.status === 'PAID' ? row.verifiedAt : null,
      publicUrl: this.config.get<string>('app.publicUrl') ?? '',
      logoPath: this.config.get<string>('app.invoiceLogoPath'),
    });

    return {
      buffer: Buffer.from(bytes),
      filename: invoiceFileName(row.number),
    };
  }
}
