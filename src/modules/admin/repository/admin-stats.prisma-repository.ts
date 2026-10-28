import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  AdminRevenueRows,
  AdminStatsRepository,
  MonthlyAmountRow,
} from './admin-stats.repository';

interface RawMonthlyRow {
  month: string;
  total: unknown;
}

interface RawCountRow {
  count: number;
}

/**
 * Paid money lives in two tables: B2C `orders` and B2B `invoices`. Both are
 * bucketed by month in WIB so the dashboard matches the Jakarta calendar.
 */
@Injectable()
export class PrismaAdminStatsRepository implements AdminStatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findRevenue(params: {
    since: Date;
    currentMonthStart: Date;
  }): Promise<AdminRevenueRows> {
    const [orders, invoices, orderCount, invoiceCount, pendingResults] =
      await Promise.all([
        this.prisma.$queryRaw<RawMonthlyRow[]>`
          SELECT to_char(
                   date_trunc('month', COALESCE("verifiedAt", "createdAt") AT TIME ZONE 'Asia/Jakarta'),
                   'YYYY-MM'
                 ) AS month,
                 COALESCE(SUM("amount"), 0)::bigint AS total
          FROM "orders"
          WHERE "status" = 'PAID'
            AND COALESCE("verifiedAt", "createdAt") >= ${params.since}
          GROUP BY 1
          ORDER BY 1
        `,
        this.prisma.$queryRaw<RawMonthlyRow[]>`
          SELECT to_char(
                   date_trunc('month', COALESCE("verifiedAt", "createdAt") AT TIME ZONE 'Asia/Jakarta'),
                   'YYYY-MM'
                 ) AS month,
                 COALESCE(SUM("amount"), 0)::bigint AS total
          FROM "invoices"
          WHERE "status" = 'PAID'
            AND COALESCE("verifiedAt", "createdAt") >= ${params.since}
          GROUP BY 1
          ORDER BY 1
        `,
        this.prisma.$queryRaw<RawCountRow[]>`
          SELECT COUNT(*)::int AS count
          FROM "orders"
          WHERE "status" = 'PAID'
            AND COALESCE("verifiedAt", "createdAt") >= ${params.currentMonthStart}
        `,
        this.prisma.$queryRaw<RawCountRow[]>`
          SELECT COUNT(*)::int AS count
          FROM "invoices"
          WHERE "status" = 'PAID'
            AND COALESCE("verifiedAt", "createdAt") >= ${params.currentMonthStart}
        `,
        this.prisma.testResult.count({ where: { status: 'PENDING_REVIEW' } }),
      ]);

    return {
      orders: orders.map(toMonthlyAmount),
      invoices: invoices.map(toMonthlyAmount),
      currentMonthPaidCount:
        (orderCount[0]?.count ?? 0) + (invoiceCount[0]?.count ?? 0),
      pendingResults,
    };
  }
}

function toMonthlyAmount(row: RawMonthlyRow): MonthlyAmountRow {
  return { month: row.month, total: Number(row.total ?? 0) };
}
