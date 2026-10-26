import { AdminInvoicesService } from '../service/admin-invoices.service';
import type { InvoicesRepository } from '../repository/invoices.repository';
import type { EventLogService } from '../../event-log/service/event-log.service';

describe('AdminInvoicesService', () => {
  let service: AdminInvoicesService;
  let repo: jest.Mocked<
    Pick<
      InvoicesRepository,
      'findById' | 'findDetailById' | 'confirmPaymentWithActivation'
    >
  >;
  let eventLog: jest.Mocked<Pick<EventLogService, 'record' | 'markProcessed'>>;

  const invoice = {
    id: 'inv1',
    amount: 200000,
    status: 'UNPAID',
    sessionId: 's1',
  };

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findDetailById: jest.fn(),
      confirmPaymentWithActivation: jest.fn(),
    };
    eventLog = {
      record: jest.fn().mockResolvedValue({ id: 'ev1' }),
      markProcessed: jest.fn(),
    };
    service = new AdminInvoicesService(repo as never, eventLog as never);
  });

  it('marks an UNPAID invoice PAID and records the actor + reason', async () => {
    repo.findById.mockResolvedValue(invoice as never);
    repo.confirmPaymentWithActivation.mockResolvedValue({
      outcome: 'confirmed',
      invoice: { ...invoice, status: 'PAID' } as never,
    });

    const result = await service.verifyBreakGlass(
      'inv1',
      'uang masuk',
      'admin1',
    );

    expect(result.status).toBe('PAID');
    expect(repo.confirmPaymentWithActivation).toHaveBeenCalledWith('inv1', {
      paidAmount: 200000,
      verifiedBySource: 'ADMIN',
    });
    expect(eventLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ADMIN_INVOICE_VERIFIED',
        aggregateId: 'inv1',
        payload: { actorId: 'admin1', reason: 'uang masuk', amount: 200000 },
      }),
    );
    expect(eventLog.markProcessed).toHaveBeenCalledWith('ev1', {
      response: { invoiceId: 'inv1', sessionId: 's1' },
    });
  });

  it('rejects an already-PAID invoice with 409 invoice_not_payable', async () => {
    repo.findById.mockResolvedValue({ ...invoice, status: 'PAID' } as never);

    await expect(
      service.verifyBreakGlass('inv1', 'uang masuk', 'admin1'),
    ).rejects.toThrow('invoice_not_payable');
    expect(repo.confirmPaymentWithActivation).not.toHaveBeenCalled();
    expect(eventLog.record).not.toHaveBeenCalled();
  });

  it('rejects a CANCELLED invoice with 409 invoice_not_payable', async () => {
    repo.findById.mockResolvedValue({
      ...invoice,
      status: 'CANCELLED',
    } as never);

    await expect(
      service.verifyBreakGlass('inv1', 'uang masuk', 'admin1'),
    ).rejects.toThrow('invoice_not_payable');
  });

  it('404s on an unknown invoice', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(
      service.verifyBreakGlass('missing', 'uang masuk', 'admin1'),
    ).rejects.toThrow('Invoice not found');
  });

  it('maps a lost race (already paid) to 409', async () => {
    repo.findById.mockResolvedValue(invoice as never);
    repo.confirmPaymentWithActivation.mockResolvedValue({
      outcome: 'already_paid',
      invoice: { ...invoice, status: 'PAID' } as never,
    });

    await expect(
      service.verifyBreakGlass('inv1', 'uang masuk', 'admin1'),
    ).rejects.toThrow('invoice_not_payable');
    expect(eventLog.record).not.toHaveBeenCalled();
  });

  describe('findDetail', () => {
    const detailRow = {
      invoice: {
        ...invoice,
        number: 'INV-2026-0002',
        status: 'PAID',
        issuedAt: new Date('2026-10-26T07:36:45.000Z'),
        dueDate: null,
        expiresAt: new Date('2026-10-27T07:36:45.000Z'),
        verifiedAt: new Date('2026-10-26T07:53:51.000Z'),
        verifiedBySource: 'MIDTRANS',
        paymentType: 'bank_transfer',
        notes: 'Dibayar via BCA VA',
      },
      institution: { id: 'inst1', name: 'PT Contoh Sejahtera' },
      session: {
        id: 's1',
        title: 'Rekrutmen Batch Oktober',
        slotLimit: 50,
        status: 'ACTIVE',
        testNames: ['DISC Form A', 'CPMI'],
      },
    };

    it('returns the institution and the tests behind the invoice', async () => {
      repo.findDetailById.mockResolvedValue(detailRow as never);

      const result = await service.findDetail('inv1');

      expect(repo.findDetailById).toHaveBeenCalledWith('inv1');
      expect(result).toMatchObject({
        number: 'INV-2026-0002',
        status: 'PAID',
        amount: 200000,
        institution: { id: 'inst1', name: 'PT Contoh Sejahtera' },
        session: {
          title: 'Rekrutmen Batch Oktober',
          slotLimit: 50,
          testNames: ['DISC Form A', 'CPMI'],
        },
        paidAt: '2026-10-26T07:53:51.000Z',
        verifiedBySource: 'MIDTRANS',
        paymentType: 'bank_transfer',
      });
    });

    it('404s when the invoice does not exist', async () => {
      repo.findDetailById.mockResolvedValue(null);

      await expect(service.findDetail('missing')).rejects.toThrow(
        'Invoice not found',
      );
    });
  });
});
