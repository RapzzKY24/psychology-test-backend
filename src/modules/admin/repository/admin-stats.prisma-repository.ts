import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  AdminRevenueRows,
  AdminStatsRepository,
  MonthlyAmountRow,
} from './admin-stats.repository';

type RevenueSource = 'orders' | 'invoices';

interface RawMonthlyRow {
  source: RevenueSource;
  month: string;
  total: unknown;
}

interface RawCountRow {
  source: RevenueSource;
  count: number;
}

/**
 * Paid money lives in two tables: B2C `orders` and B2B `invoices`. Both are
 * bucketed by month in WIB so the dashboard matches the Jakarta calendar.
 * One UNION ALL keeps the two series in a single round trip.
 */
@Injectable()
export class PrismaAdminStatsRepository implements AdminStatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findRevenue(params: {
    since: Date;
    currentMonthStart: Date;
  }): Promise<AdminRevenueRows> {
    const [monthly, counts, pendingResults] = await Promise.all([
      this.prisma.$queryRaw<RawMonthlyRow[]>`
        SELECT 'orders' AS source,
               to_char(
                 date_trunc('month', COALESCE("verifiedAt", "createdAt") AT TIME ZONE 'Asia/Jakarta'),
                 'YYYY-MM'
               ) AS month,
               COALESCE(SUM("amount"), 0)::bigint AS total
        FROM "orders"
        WHERE "status" = 'PAID'
          AND COALESCE("verifiedAt", "createdAt") >= ${params.since}
        GROUP BY 1, 2
        UNION ALL
        SELECT 'invoices' AS source,
               to_char(
                 date_trunc('month', COALESCE("verifiedAt", "createdAt") AT TIME ZONE 'Asia/Jakarta'),
                 'YYYY-MM'
               ) AS month,
               COALESCE(SUM("amount"), 0)::bigint AS total
        FROM "invoices"
        WHERE "status" = 'PAID'
          AND COALESCE("verifiedAt", "createdAt") >= ${params.since}
        GROUP BY 1, 2
      `,
      this.prisma.$queryRaw<RawCountRow[]>`
        SELECT 'orders' AS source, COUNT(*)::int AS count
        FROM "orders"
        WHERE "status" = 'PAID'
          AND COALESCE("verifiedAt", "createdAt") >= ${params.currentMonthStart}
        UNION ALL
        SELECT 'invoices' AS source, COUNT(*)::int AS count
        FROM "invoices"
        WHERE "status" = 'PAID'
          AND COALESCE("verifiedAt", "createdAt") >= ${params.currentMonthStart}
      `,
      this.prisma.testResult.count({ where: { status: 'PENDING_REVIEW' } }),
    ]);

    return {
      orders: monthly
        .filter((row) => row.source === 'orders')
        .map(toMonthlyAmount),
      invoices: monthly
        .filter((row) => row.source === 'invoices')
        .map(toMonthlyAmount),
      currentMonthPaidCount: counts.reduce(
        (total, row) => total + Number(row.count),
        0,
      ),
      pendingResults,
    };
  }
}

function toMonthlyAmount(row: RawMonthlyRow): MonthlyAmountRow {
  return { month: row.month, total: Number(row.total ?? 0) };
}
