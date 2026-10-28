import { Test } from '@nestjs/testing';
import { AdminStatsService } from '../service/admin-stats.service';
import { ADMIN_STATS_REPOSITORY } from '../repository/admin-stats.repository';
import type { AdminStatsRepository } from '../repository/admin-stats.repository';

/** Plain jest mocks — `jest.Mocked<T>` keeps the interface methods, which the
 *  `unbound-method` lint rule rejects when they are passed to `expect`. */
type MockedRepo = { [K in keyof AdminStatsRepository]: jest.Mock };

// 2026-10-28T05:00:00Z === 2026-10-28 12:00 WIB.
const NOW = new Date('2026-10-28T05:00:00Z');

describe('AdminStatsService', () => {
  let service: AdminStatsService;
  let repo: MockedRepo;

  beforeEach(async () => {
    repo = { findRevenue: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminStatsService,
        { provide: ADMIN_STATS_REPOSITORY, useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(AdminStatsService);
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return one bucket per requested month, oldest first', async () => {
    repo.findRevenue.mockResolvedValue({
      orders: [],
      invoices: [],
      currentMonthPaidCount: 0,
      pendingResults: 0,
    });

    const result = await service.getRevenue(3);

    expect(result.months.map((bucket) => bucket.month)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(result.months.every((bucket) => bucket.total === 0)).toBe(true);
  });

  it('should sum orders and invoices into the monthly total', async () => {
    repo.findRevenue.mockResolvedValue({
      orders: [{ month: '2026-09', total: 1_250_000 }],
      invoices: [
        { month: '2026-09', total: 4_000_000 },
        { month: '2026-10', total: 2_000_000 },
      ],
      currentMonthPaidCount: 3,
      pendingResults: 7,
    });

    const result = await service.getRevenue(2);

    expect(result.months).toEqual([
      {
        month: '2026-09',
        orders: 1_250_000,
        invoices: 4_000_000,
        total: 5_250_000,
      },
      { month: '2026-10', orders: 0, invoices: 2_000_000, total: 2_000_000 },
    ]);
  });

  it('should report the current month total and paid count', async () => {
    repo.findRevenue.mockResolvedValue({
      orders: [{ month: '2026-10', total: 500_000 }],
      invoices: [],
      currentMonthPaidCount: 12,
      pendingResults: 4,
    });

    const result = await service.getRevenue(6);

    expect(result.currentMonth).toEqual({ total: 500_000, paidCount: 12 });
    expect(result.pendingResults).toBe(4);
  });

  it('should query from the first day of the oldest month, WIB', async () => {
    repo.findRevenue.mockResolvedValue({
      orders: [],
      invoices: [],
      currentMonthPaidCount: 0,
      pendingResults: 0,
    });

    await service.getRevenue(6);

    expect(repo.findRevenue).toHaveBeenCalledWith({
      since: new Date('2026-04-30T17:00:00.000Z'), // 2026-05-01 00:00 WIB
      currentMonthStart: new Date('2026-09-30T17:00:00.000Z'), // 2026-10-01 00:00 WIB
    });
  });

  it('should ignore rows outside the requested window', async () => {
    repo.findRevenue.mockResolvedValue({
      orders: [{ month: '2025-01', total: 9_999_999 }],
      invoices: [],
      currentMonthPaidCount: 0,
      pendingResults: 0,
    });

    const result = await service.getRevenue(1);

    expect(result.months).toEqual([
      { month: '2026-10', orders: 0, invoices: 0, total: 0 },
    ]);
  });
});
