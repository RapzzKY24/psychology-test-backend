import { AdminInvoicesService } from '../service/admin-invoices.service';
import type { InvoicesRepository } from '../repository/invoices.repository';
import type { EventLogService } from '../../event-log/service/event-log.service';

describe('AdminInvoicesService', () => {
  let service: AdminInvoicesService;
  let repo: jest.Mocked<
    Pick<InvoicesRepository, 'findById' | 'confirmPaymentWithActivation'>
  >;
  let eventLog: jest.Mocked<Pick<EventLogService, 'record' | 'markProcessed'>>;

  const invoice = {
    id: 'inv1',
    amount: 200000,
    status: 'UNPAID',
    sessionId: 's1',
  };

  beforeEach(() => {
    repo = { findById: jest.fn(), confirmPaymentWithActivation: jest.fn() };
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
});
