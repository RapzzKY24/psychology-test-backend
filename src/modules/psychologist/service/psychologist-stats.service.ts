import { Inject, Injectable } from '@nestjs/common';
import { startOfWibDay, wibDayKeys } from '../../../common/utils/wib';
import { PSYCHOLOGIST_STATS_REPOSITORY } from '../repository/psychologist-stats.repository';
import type { PsychologistStatsRepository } from '../repository/psychologist-stats.repository';
import type { ReviewStats } from '../dto/psychologist-stats.dto';
import { fillDailyCounts } from '../utils/fill-daily-counts';

/** Window for the personal "what did I decide" counters. */
const OUTCOME_WINDOW_DAYS = 7;

@Injectable()
export class PsychologistStatsService {
  constructor(
    @Inject(PSYCHOLOGIST_STATS_REPOSITORY)
    private readonly repo: PsychologistStatsRepository,
  ) {}

  async getReviewStats(
    psychologistId: string,
    days: number,
  ): Promise<ReviewStats> {
    const now = new Date();
    const keys = wibDayKeys(now, days);
    const [incoming, outcome, queueNow] = await Promise.all([
      this.repo.findIncomingByDay({ since: startOfWibDay(now, days - 1) }),
      this.repo.findOutcome({
        psychologistId,
        since: startOfWibDay(now, OUTCOME_WINDOW_DAYS - 1),
      }),
      this.repo.countPending(),
    ]);

    return {
      incoming: fillDailyCounts(keys, incoming),
      mine: {
        approved7d: outcome.approved,
        returned7d: outcome.returned,
      },
      queueNow,
    };
  }
}
