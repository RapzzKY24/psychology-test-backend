import { PrismaInvoicesRepository } from '../repository/invoices.prisma-repository';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { Invoice } from '../../../generated/prisma/client';

type Tx = {
  invoice: {
    findUnique: jest.Mock;
    updateMany: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  testSession: { updateMany: jest.Mock };
};

function tx(): Tx {
  return {
    invoice: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    testSession: { updateMany: jest.fn() },
  };
}

function makeRepo(t: Tx): PrismaInvoicesRepository {
  const prisma = {
    $transaction: (fn: (tx: Tx) => unknown) => fn(t),
  } as unknown as PrismaService;
  return new PrismaInvoicesRepository(prisma);
}

const invoice = (over: Partial<Invoice>): Invoice =>
  ({
    id: 'inv1',
    status: 'UNPAID',
    amount: 300000,
    sessionId: 'sess1',
    ...over,
  }) as Invoice;

describe('PrismaInvoicesRepository.confirmPaymentWithActivation', () => {
  it('returns not_found when the invoice is missing', async () => {
    const t = tx();
    t.invoice.findUnique.mockResolvedValue(null);

    const result = await makeRepo(t).confirmPaymentWithActivation('inv1', {
      paidAmount: 300000,
      verifiedBySource: 'JOKUL',
    });

    expect(result.outcome).toBe('not_found');
    expect(t.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('returns already_paid without side effects for a PAID invoice', async () => {
    const t = tx();
    t.invoice.findUnique.mockResolvedValue(invoice({ status: 'PAID' }));

    const result = await makeRepo(t).confirmPaymentWithActivation('inv1', {
      paidAmount: 300000,
      verifiedBySource: 'JOKUL',
    });

    expect(result.outcome).toBe('already_paid');
    expect(t.invoice.updateMany).not.toHaveBeenCalled();
    expect(t.testSession.updateMany).not.toHaveBeenCalled();
  });

  it('returns conflict for a CANCELLED invoice', async () => {
    const t = tx();
    t.invoice.findUnique.mockResolvedValue(invoice({ status: 'CANCELLED' }));

    const result = await makeRepo(t).confirmPaymentWithActivation('inv1', {
      paidAmount: 300000,
      verifiedBySource: 'JOKUL',
    });

    expect(result).toEqual({
      outcome: 'conflict',
      reason: 'invoice_cancelled',
    });
    expect(t.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('returns amount_mismatch and never writes', async () => {
    const t = tx();
    t.invoice.findUnique.mockResolvedValue(invoice({}));

    const result = await makeRepo(t).confirmPaymentWithActivation('inv1', {
      paidAmount: 299999,
      verifiedBySource: 'JOKUL',
    });

    expect(result.outcome).toBe('amount_mismatch');
    expect(t.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('marks PAID and activates the session on a matching amount', async () => {
    const t = tx();
    t.invoice.findUnique.mockResolvedValue(invoice({}));
    t.invoice.updateMany.mockResolvedValue({ count: 1 });
    t.testSession.updateMany.mockResolvedValue({ count: 1 });
    t.invoice.findUniqueOrThrow.mockResolvedValue(invoice({ status: 'PAID' }));

    const result = await makeRepo(t).confirmPaymentWithActivation('inv1', {
      paidAmount: 300000,
      verifiedBySource: 'JOKUL',
    });

    expect(result.outcome).toBe('confirmed');
    expect(t.invoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv1', status: 'UNPAID' },
      }),
    );
    const [[updateArgs]] = t.invoice.updateMany.mock.calls as unknown as [
      [{ data: Record<string, unknown> }],
    ];
    expect(updateArgs.data).toMatchObject({
      status: 'PAID',
      verifiedBySource: 'JOKUL',
    });
    expect(t.testSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'sess1', status: 'PENDING_PAYMENT' },
      data: { status: 'ACTIVE' },
    });
  });

  it('treats a lost guarded-update race as already_paid', async () => {
    const t = tx();
    t.invoice.findUnique
      .mockResolvedValueOnce(invoice({}))
      .mockResolvedValueOnce(invoice({ status: 'PAID' }));
    t.invoice.updateMany.mockResolvedValue({ count: 0 });

    const result = await makeRepo(t).confirmPaymentWithActivation('inv1', {
      paidAmount: 300000,
      verifiedBySource: 'JOKUL',
    });

    expect(result.outcome).toBe('already_paid');
    expect(t.testSession.updateMany).not.toHaveBeenCalled();
  });
});

describe('PrismaInvoicesRepository.regenerateAmount', () => {
  it('voids the stale VA columns alongside the new amount', async () => {
    const update = jest.fn().mockResolvedValue(invoice({ amount: 150000 }));
    const prisma = { invoice: { update } } as unknown as PrismaService;

    await new PrismaInvoicesRepository(prisma).regenerateAmount('inv1', 150000);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'inv1' },
      data: {
        amount: 150000,
        vaNumber: null,
        vaBankCode: null,
      },
    });
  });
});
