import {
  bandFor,
  parseTimedGridConfig,
  parseTimedGridItem,
  timedGridKey,
  TimedGridResponseSchema,
} from './schemas/timed-grid';
import type { TimedGridFactor } from './schemas/timed-grid';

export interface TimedGridColumnScore {
  /** Printed lajur number, so the review table need not count items. */
  column: number;
  correct: number;
  wrong: number;
  skipped: number;
  /** `correct + wrong` — the gaps the participant actually answered. */
  attempted: number;
  /** Gaps in the lajur, i.e. `digits.length - 1`. */
  gaps: number;
}

export interface TimedGridMetric {
  label: string;
  /** Rounded to the factor's `decimals`, the value the band is read with. */
  value: number;
  /** Band label, or null when the group has no matching row. */
  band: string | null;
  /** Norm group the band was read from. */
  group: string;
}

export interface TimedGridScores {
  /** Number of lajur. */
  total: number;
  /** Number of gaps across every lajur. */
  gaps: number;
  correct: number;
  wrong: number;
  skipped: number;
  columns: TimedGridColumnScore[];
  /** Correct answers per lajur, in item order — the work curve. */
  curve: number[];
  metrics: Record<string, TimedGridMetric>;
}

export interface TimedGridScorerOutput {
  scores: TimedGridScores;
  patternCode: string;
}

/**
 * Scores a digit grid the way the source workbooks do.
 *
 * The examiner's paper flow counts errors and skips by hand and types three
 * numbers per lajur into Excel. Here the answers are on screen, so all three
 * are derived: a `null` cell is a `lubang`, a cell that differs from the key is
 * `salah`, and the rest are `benar`. That is why the family sets
 * `allowsBlank` — a participant caught by the timer mid-lajur still has a
 * meaningful curve.
 *
 * The four factors are the workbook's own:
 * `MEAN_CORRECT` (Panker), `MEAN_DEVIATION` (Janker), `SLOPE` (Hanker) and
 * `ERRORS` (Tianker). Only `MEAN_DEVIATION` departs from the sheet: the
 * template sums absolute deviations over a fixed 1..27 frequency table, which
 * drops lajur scoring 0 or above 27. This sums over every lajur instead.
 */
export function scoreTimedGrid(input: {
  items: { id: string; content: unknown }[];
  responses: { itemId: string; value: unknown }[];
  scoringConfig?: unknown;
  education?: string | null;
}): TimedGridScorerOutput {
  const config = parseTimedGridConfig(input.scoringConfig);
  const answersByItem = new Map<string, unknown>(
    input.responses.map((response) => [response.itemId, response.value]),
  );

  const columns: TimedGridColumnScore[] = [];
  for (const item of input.items) {
    const content = parseTimedGridItem(item.content);
    if (!content) continue;
    const key = timedGridKey(content.digits);
    const parsed = TimedGridResponseSchema.safeParse(answersByItem.get(item.id));
    const answers = parsed.success ? parsed.data.answers : [];

    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    key.forEach((expected, index) => {
      const answer = answers[index];
      if (answer === null || answer === undefined) skipped += 1;
      else if (answer === expected) correct += 1;
      else wrong += 1;
    });

    columns.push({
      column: content.column,
      correct,
      wrong,
      skipped,
      attempted: correct + wrong,
      gaps: key.length,
    });
  }

  const curve = columns.map((column) => column.correct);
  const scores: TimedGridScores = {
    total: columns.length,
    gaps: columns.reduce((sum, column) => sum + column.gaps, 0),
    correct: columns.reduce((sum, column) => sum + column.correct, 0),
    wrong: columns.reduce((sum, column) => sum + column.wrong, 0),
    skipped: columns.reduce((sum, column) => sum + column.skipped, 0),
    columns,
    curve,
    metrics: {},
  };

  for (const factor of config?.factors ?? []) {
    const group =
      (input.education && config?.educationGroups[input.education]) ||
      factor.defaultGroup;
    const raw = factorValue(factor, curve, scores);
    const value = round(raw, factor.decimals);
    const bands = factor.groups[group] ?? factor.groups[factor.defaultGroup] ?? [];
    scores.metrics[factor.code] = {
      label: factor.label,
      value,
      band: bandFor(bands, value),
      group,
    };
  }

  return { scores, patternCode: 'WORK_CURVE' };
}

function factorValue(
  factor: TimedGridFactor,
  curve: number[],
  scores: TimedGridScores,
): number {
  const n = curve.length;
  switch (factor.formula) {
    case 'MEAN_CORRECT':
      return n === 0 ? 0 : scores.correct / n;
    case 'MEAN_DEVIATION': {
      if (n === 0) return 0;
      const mean = scores.correct / n;
      return curve.reduce((sum, value) => sum + Math.abs(value - mean), 0) / n;
    }
    case 'SLOPE': {
      // The workbook reads the fitted line at x = 0 and x = n, so the metric
      // is the slope scaled by the lajur count — not the slope itself.
      if (n < 2) return 0;
      const sumX = (n * (n + 1)) / 2;
      const sumY = scores.correct;
      const sumXY = curve.reduce((sum, value, index) => sum + (index + 1) * value, 0);
      const sumXX = (n * (n + 1) * (2 * n + 1)) / 6;
      const denominator = n * sumXX - sumX * sumX;
      if (denominator === 0) return 0;
      return ((n * sumXY - sumX * sumY) / denominator) * n;
    }
    case 'ERRORS':
      return scores.wrong + scores.skipped;
  }
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
