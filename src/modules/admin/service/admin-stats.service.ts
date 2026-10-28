import { Inject, Injectable } from '@nestjs/common';
import { startOfWibMonth, wibMonthKeys } from '../../../common/utils/wib';
import { ADMIN_STATS_REPOSITORY } from '../repository/admin-stats.repository';
import type { AdminStatsRepository } from '../repository/admin-stats.repository';
import type { AdminRevenueStats } from '../dto/admin-stats.dto';
import { mergeMonthlyRevenue } from '../utils/merge-monthly-revenue';

@Injectable()
export class AdminStatsService {
  constructor(
    @Inject(ADMIN_STATS_REPOSITORY)
    private readonly repo: AdminStatsRepository,
  ) {}

  async getRevenue(months: number): Promise<AdminRevenueStats> {
    const now = new Date();
    const keys = wibMonthKeys(now, months);
    const rows = await this.repo.findRevenue({
      since: startOfWibMonth(now, months - 1),
      currentMonthStart: startOfWibMonth(now, 0),
    });
    const buckets = mergeMonthlyRevenue(keys, rows.orders, rows.invoices);
    const current = buckets[buckets.length - 1];

    return {
      months: buckets,
      currentMonth: {
        total: current?.total ?? 0,
        paidCount: rows.currentMonthPaidCount,
      },
      pendingResults: rows.pendingResults,
    };
  }
}
