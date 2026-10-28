import { NotFoundException } from '@nestjs/common';
import { InvoicePdfService } from '../service/invoice-pdf.service';
import { renderInvoicePdf } from '../pdf/invoice-pdf';
import type {
  InvoicePdfRow,
  InvoicesRepository,
} from '../repository/invoices.repository';

jest.mock('../pdf/invoice-pdf', () => ({
  renderInvoicePdf: jest.fn(() =>
    Promise.resolve(new Uint8Array([37, 80, 68, 70])),
  ),
  invoiceFileName: (number: string) => `Invoice-${number}.pdf`,
}));

const row: InvoicePdfRow = {
  number: 'INV-2026-0001',
  amount: 1500000,
  status: 'UNPAID',
  issuedAt: new Date('2026-10-28T03:00:00.000Z'),
  dueDate: null,
  verifiedAt: null,
  notes: null,
  verificationToken: 'token-abc',
  vaNumber: null,
  vaBankCode: null,
  institution: { name: 'PT Contoh', address: null, contactEmail: 'a@b.test' },
  session: null,
};

describe('InvoicePdfService', () => {
  let service: InvoicePdfService;
  let repo: { findForPdf: jest.Mock };

  const config = {
    get: jest.fn((key: string) => {
      if (key === 'app.publicUrl') return 'https://psikologitest.id';
      if (key === 'app.invoiceLogoPath') return './assets/invoice/logo.jpeg';
      return undefined;
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repo = { findForPdf: jest.fn() };
    service = new InvoicePdfService(
      repo as unknown as InvoicesRepository,
      config as never,
    );
  });

  it('throws 404 when the invoice is not visible to the caller', async () => {
    repo.findForPdf.mockResolvedValue(null);

    await expect(service.render({ id: 'inv1' })).rejects.toThrow(
      NotFoundException,
    );
    expect(renderInvoicePdf).not.toHaveBeenCalled();
  });

  it('forwards the institution scope to the repository', async () => {
    repo.findForPdf.mockResolvedValue(row);

    await service.render({ id: 'inv1', institutionId: 'inst1' });

    expect(repo.findForPdf).toHaveBeenCalledWith({
      id: 'inv1',
      institutionId: 'inst1',
    });
  });

  it('returns the rendered bytes with a filename from the invoice number', async () => {
    repo.findForPdf.mockResolvedValue(row);

    const result = await service.render({ id: 'inv1' });

    expect(result.filename).toBe('Invoice-INV-2026-0001.pdf');
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
  });

  it('passes the public URL and logo path from config to the renderer', async () => {
    repo.findForPdf.mockResolvedValue(row);

    await service.render({ id: 'inv1' });

    expect(renderInvoicePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        publicUrl: 'https://psikologitest.id',
        logoPath: './assets/invoice/logo.jpeg',
        paidAt: null,
      }),
    );
  });

  it('maps verifiedAt to paidAt only when the invoice is paid', async () => {
    const paidAt = new Date('2026-10-29T02:00:00.000Z');
    repo.findForPdf.mockResolvedValue({
      ...row,
      status: 'PAID',
      verifiedAt: paidAt,
    });

    await service.render({ id: 'inv1' });

    expect(renderInvoicePdf).toHaveBeenCalledWith(
      expect.objectContaining({ paidAt }),
    );
  });
});
