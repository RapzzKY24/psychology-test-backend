import {
  PairItemContentSchema,
  PairResponseSchema,
  pairDimensions,
} from './schemas/forced-choice-pair';
import type { PairDimension } from './schemas/forced-choice-pair';

export interface PairDimensionScore {
  left: string;
  right: string;
  leftCount: number;
  rightCount: number;
  leftPercent: number;
  rightPercent: number;
  /** Pole that won this dimension; a tie goes to the right pole. */
  winner: string;
}

export interface PairScores {
  /** One letter per dimension, in first-appearance order — e.g. "INFP". */
  type: string;
  total: number;
  answered: number;
  dimensions: Record<string, PairDimensionScore>;
}

export interface PairScorerOutput {
  scores: PairScores;
  patternCode: string;
}

function percent(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 100);
}

/**
 * Counts picks per pole, then takes the majority pole of every dimension.
 *
 * A tie resolves to the right pole — the same rule the source spreadsheet uses
 * (`IF(left > right, left, right)`), so a blank attempt lands on the right-hand
 * letters instead of an arbitrary side.
 */
export function scoreForcedChoicePair(input: {
  items: { id: string; content: unknown }[];
  responses: { itemId: string; value: unknown }[];
}): PairScorerOutput {
  const dimensions = pairDimensions(input.items);
  const byKey = new Map<string, PairDimension>(
    dimensions.map((dimension) => [dimension.key, dimension]),
  );

  /** itemId -> the dimension it scores and the pole of each statement. */
  const items = new Map<
    string,
    { dimension: PairDimension; mapping: string[] }
  >();
  for (const item of input.items) {
    const parsed = PairItemContentSchema.safeParse(item.content);
    if (!parsed.success) continue;
    const key = [...parsed.data.mapping].sort().join('');
    const dimension = byKey.get(key);
    if (!dimension) continue;
    items.set(item.id, { dimension, mapping: parsed.data.mapping });
  }

  const counts = new Map<string, Record<string, number>>();
  for (const dimension of dimensions) {
    counts.set(dimension.key, { [dimension.left]: 0, [dimension.right]: 0 });
  }

  let answered = 0;
  for (const response of input.responses) {
    const entry = items.get(response.itemId);
    if (!entry) continue;
    const parsed = PairResponseSchema.safeParse(response.value);
    if (!parsed.success) continue;

    const pole = entry.mapping[parsed.data.chosen];
    const bucket = counts.get(entry.dimension.key);
    if (!bucket || bucket[pole] === undefined) continue;
    bucket[pole] += 1;
    answered += 1;
  }

  const scores: PairScores = {
    type: '',
    total: input.items.length,
    answered,
    dimensions: {},
  };

  let type = '';
  for (const dimension of dimensions) {
    const bucket = counts.get(dimension.key) ?? {};
    const leftCount = bucket[dimension.left] ?? 0;
    const rightCount = bucket[dimension.right] ?? 0;
    const total = leftCount + rightCount;
    const winner = leftCount > rightCount ? dimension.left : dimension.right;
    scores.dimensions[dimension.key] = {
      left: dimension.left,
      right: dimension.right,
      leftCount,
      rightCount,
      leftPercent: percent(leftCount, total),
      rightPercent: percent(rightCount, total),
      winner,
    };
    type += winner;
  }
  scores.type = type;

  return { scores, patternCode: type };
}
