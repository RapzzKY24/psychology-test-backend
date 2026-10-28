import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  DailyCountRow,
  PsychologistStatsRepository,
  ReviewOutcomeRow,
} from './psychologist-stats.repository';

interface RawDailyRow {
  date: string;
  count: number;
}

@Injectable()
export class PrismaPsychologistStatsRepository implements PsychologistStatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findIncomingByDay(params: { since: Date }): Promise<DailyCountRow[]> {
    const rows = await this.prisma.$queryRaw<RawDailyRow[]>`
      SELECT to_char(
               date_trunc('day', "computedAt" AT TIME ZONE 'Asia/Jakarta'),
               'YYYY-MM-DD'
             ) AS date,
             COUNT(*)::int AS count
      FROM "test_results"
      WHERE "computedAt" >= ${params.since}
      GROUP BY 1
      ORDER BY 1
    `;
    return rows.map((row) => ({ date: row.date, count: Number(row.count) }));
  }

  async findOutcome(params: {
    psychologistId: string;
    since: Date;
  }): Promise<ReviewOutcomeRow> {
    const where = {
      reviewedById: params.psychologistId,
      reviewedAt: { gte: params.since },
    };
    const [approved, returned] = await Promise.all([
      this.prisma.testResult.count({ where: { ...where, status: 'APPROVED' } }),
      this.prisma.testResult.count({ where: { ...where, status: 'RETURNED' } }),
    ]);
    return { approved, returned };
  }

  countPending(): Promise<number> {
    return this.prisma.testResult.count({
      where: { status: 'PENDING_REVIEW' },
    });
  }
}
