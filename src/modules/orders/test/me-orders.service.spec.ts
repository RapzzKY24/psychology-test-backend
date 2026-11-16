import { MeOrdersService } from '../service/me-orders.service';
import type { OrdersRepository } from '../repository/orders.repository';
import type { Order } from '../../../generated/prisma/client';

const MINUTE = 60_000;

function order(overrides: Partial<Order> & { testName?: string }): Order & {
  test: { name: string };
} {
  const { testName = 'DISC Form A', ...rest } = overrides;
  return {
    id: 'order-1',
    userId: 'u1',
    testId: 't1',
    basePrice: 75_000,
    uniqueCode: 0,
    amount: 75_000,
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 30 * MINUTE),
    userClaimedAt: null,
    verifiedById: null,
    verifiedBySource: null,
    verifiedAt: null,
    cancelReason: null,
    paymentProvider: 'DOKU_CHECKOUT',
    vaNumber: null,
    vaBankCode: null,
    providerOrderId: 'provider-1',
    paymentToken: null,
    paymentUrl: 'https://checkout.example/1',
    paymentType: null,
    createdAt: new Date('2026-11-16T07:00:00.000Z'),
    updatedAt: new Date('2026-11-16T07:00:00.000Z'),
    ...rest,
    test: { name: testName },
  };
}

describe('MeOrdersService', () => {
  let service: MeOrdersService;
  let repo: {
    expireStalePending: jest.Mock;
    listByUser: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      expireStalePending: jest.fn().mockResolvedValue(0),
      listByUser: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    };
    service = new MeOrdersService(repo as unknown as OrdersRepository);
  });

  it('expires stale orders before reading, so no row reads as payable late', async () => {
    await service.list('u1', { page: 1, limit: 10 });

    expect(repo.expireStalePending).toHaveBeenCalledTimes(1);
  });

  it('scopes the query to the session user and forwards paging', async () => {
    repo.listByUser.mockResolvedValue({ data: [order({})], total: 23 });

    const result = await service.list('u1', { page: 3, limit: 10 });

    expect(repo.listByUser).toHaveBeenCalledWith({
      userId: 'u1',
      skip: 20,
      take: 10,
      status: undefined,
    });
    expect(result.meta).toEqual({
      page: 3,
      limit: 10,
      total: 23,
      totalPages: 3,
    });
  });

  it('forwards the status filter', async () => {
    await service.list('u1', { page: 1, limit: 10, status: 'PAID' });

    expect(repo.listByUser).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PAID' }),
    );
  });

  it('marks a pending order inside its window as payable and keeps the link', async () => {
    repo.listByUser.mockResolvedValue({ data: [order({})], total: 1 });

    const [item] = (await service.list('u1', { page: 1, limit: 10 })).data;

    expect(item).toMatchObject({
      testName: 'DISC Form A',
      amount: 75_000,
      status: 'PENDING',
      canPay: true,
      paymentUrl: 'https://checkout.example/1',
      paidAt: null,
    });
  });

  it('does not offer payment on a pending order whose window has passed', async () => {
    repo.listByUser.mockResolvedValue({
      data: [
        order({
          status: 'PENDING',
          expiresAt: new Date(Date.now() - MINUTE),
        }),
      ],
      total: 1,
    });

    const [item] = (await service.list('u1', { page: 1, limit: 10 })).data;

    expect(item.canPay).toBe(false);
    expect(item.paymentUrl).toBeNull();
  });

  it('hides the checkout link once the order is paid and reports the paid date', async () => {
    const paidAt = new Date('2026-11-16T08:00:00.000Z');
    repo.listByUser.mockResolvedValue({
      data: [order({ status: 'PAID', verifiedAt: paidAt })],
      total: 1,
    });

    const [item] = (await service.list('u1', { page: 1, limit: 10 })).data;

    expect(item.canPay).toBe(false);
    expect(item.paymentUrl).toBeNull();
    expect(item.paidAt).toEqual(paidAt);
  });

  it('keeps a null link on a payable manual-QRIS order', async () => {
    repo.listByUser.mockResolvedValue({
      data: [order({ paymentProvider: 'MANUAL_QRIS', paymentUrl: null })],
      total: 1,
    });

    const [item] = (await service.list('u1', { page: 1, limit: 10 })).data;

    expect(item.canPay).toBe(true);
    expect(item.paymentUrl).toBeNull();
  });
});
