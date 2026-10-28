import type { DailyCountRow } from '../repository/psychologist-stats.repository';

export interface DailyIncomingPoint {
  date: string;
  count: number;
}

/**
 * Days without a new result must still appear on the axis, so the series is
 * driven by the requested keys, not by the rows that came back.
 */
export function fillDailyCounts(
  keys: string[],
  rows: DailyCountRow[],
): DailyIncomingPoint[] {
  const countByDate = new Map(rows.map((row) => [row.date, row.count]));
  return keys.map((date) => ({ date, count: countByDate.get(date) ?? 0 }));
}
