import { InstansiInvoicesService } from '../service/instansi-invoices.service';

describe('InstansiInvoicesService.list', () => {
  const invoicesService = { findByInstitution: jest.fn() };
  const participantsService = { resolveInstitutionId: jest.fn() };
  const pdfService = { render: jest.fn() };
  const service = new InstansiInvoicesService(
    invoicesService as never,
    participantsService as never,
    pdfService as never,
  );

  const row = {
    id: 'inv1',
    number: 'INV-2026-0002',
    amount: 400000,
    status: 'UNPAID',
    sessionId: 's1',
    vaNumber: null,
    vaBankCode: null,
    paymentUrl: 'https://app.sandbox.midtrans.com/snap/v4/redirection/tok',
    paymentToken: 'tok',
    expiresAt: new Date('2026-10-27T00:00:00.000Z'),
    session: { title: 'DISC Form A', slotLimit: 50 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    participantsService.resolveInstitutionId.mockResolvedValue('inst1');
  });

  it('scopes the query to the caller institution and paginates', async () => {
    invoicesService.findByInstitution.mockResolvedValue({
      data: [row],
      total: 3,
    });

    const result = await service.list('user1', { page: 2, limit: 2 });

    expect(invoicesService.findByInstitution).toHaveBeenCalledWith({
      institutionId: 'inst1',
      skip: 2,
      take: 2,
    });
    expect(result.meta).toEqual({
      page: 2,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
    expect(result.data[0]).toMatchObject({
      number: 'INV-2026-0002',
      sessionTitle: 'DISC Form A',
      slotLimit: 50,
    });
  });

  it('keeps a session-less invoice renderable', async () => {
    invoicesService.findByInstitution.mockResolvedValue({
      data: [{ ...row, sessionId: null, session: null }],
      total: 1,
    });

    const result = await service.list('user1', { page: 1, limit: 10 });

    expect(result.data[0]).toMatchObject({
      sessionTitle: null,
      slotLimit: null,
    });
  });
  describe('renderPdf', () => {
    it('scopes the PDF to the caller institution', async () => {
      pdfService.render.mockResolvedValue({
        buffer: Buffer.from('%PDF-'),
        filename: 'Invoice-INV-2026-0002.pdf',
      });

      const result = await service.renderPdf('user-1', 'inv1');

      expect(pdfService.render).toHaveBeenCalledWith({
        id: 'inv1',
        institutionId: 'inst1',
      });
      expect(result.filename).toBe('Invoice-INV-2026-0002.pdf');
    });
  });
});
