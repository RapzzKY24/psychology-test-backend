export const PSYCHOLOGIST_STATS_REPOSITORY = 'PsychologistStatsRepository';

export interface DailyCountRow {
  /** Calendar day in Asia/Jakarta, formatted `YYYY-MM-DD`. */
  date: string;
  count: number;
}

export interface ReviewOutcomeRow {
  approved: number;
  returned: number;
}

export interface PsychologistStatsRepository {
  /** Results that entered the review queue since `since`, bucketed per WIB day. */
  findIncomingByDay(params: { since: Date }): Promise<DailyCountRow[]>;
  /** Reviews the psychologist personally decided in the window. */
  findOutcome(params: {
    psychologistId: string;
    since: Date;
  }): Promise<ReviewOutcomeRow>;
  countPending(): Promise<number>;
}
