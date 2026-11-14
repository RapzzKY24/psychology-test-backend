import {
  DEFAULT_RATING_RANGE,
  LikertItemContentSchema,
  LikertResponseSchema,
  bandCode,
  likertScales,
  parseLikertConfig,
} from './schemas/likert';
import type { LikertConfig } from './schemas/likert';

export interface LikertScaleScore {
  /** Sum of the (reverse-flipped) ratings on this scale. */
  score: number;
  /** Items on this scale × the highest rating — the ceiling for `score`. */
  max: number;
  percent: number;
  /** Present only when the test declares `scoringConfig.bands`. */
  band?: string;
}

export interface LikertScores {
  /** The scale with the highest percent; also the first part of the pattern code. */
  type: string;
  /** Band of the winning scale, when the test declares bands. */
  band?: string;
  total: number;
  answered: number;
  scales: Record<string, LikertScaleScore>;
}

export interface LikertScorerOutput {
  scores: LikertScores;
  patternCode: string;
}

function percent(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 100);
}

/**
 * Bands are cut on the percent, not the raw sum: Big Five scales hold 8–10
 * items, so 32/40 and 40/50 are the same result. The last row is the catch-all,
 * mirroring the workbook's `<=33 / <=66 / else` chain.
 */
function bandFor(value: number, config: LikertConfig): string | undefined {
  if (!config.bands?.length) return undefined;
  const rows = [...config.bands].sort((a, b) => a.max - b.max);
  const row = rows.find((entry) => value <= entry.max);
  return (row ?? rows[rows.length - 1]).label;
}

/**
 * Sums the ratings per scale, flips the reverse-keyed items, and takes the
 * scale that reaches the highest percent of its own ceiling.
 *
 * There is no right answer: the profile is the result. The pattern code is
 * `SCALE_BAND` when the test declares bands (`E_TINGGI`) and the bare scale
 * otherwise, so publish can demand exactly the interpretations this test emits.
 */
export function scoreLikert(input: {
  items: { id: string; content: unknown }[];
  responses: { itemId: string; value: unknown }[];
  scoringConfig?: unknown;
}): LikertScorerOutput {
  const config = parseLikertConfig(input.scoringConfig);
  const range = config.ratingRange ?? DEFAULT_RATING_RANGE;
  const scales = likertScales(input.items);

  const sum = new Map<string, number>(scales.map((scale) => [scale, 0]));
  const max = new Map<string, number>(scales.map((scale) => [scale, 0]));

  /** itemId -> the scale and the flip rule of that item. */
  const itemKey = new Map<string, { scale: string; reverse: boolean }>();
  for (const item of input.items) {
    const parsed = LikertItemContentSchema.safeParse(item.content);
    if (!parsed.success) continue;
    itemKey.set(item.id, {
      scale: parsed.data.scale,
      reverse: parsed.data.reverse === true,
    });
    max.set(parsed.data.scale, (max.get(parsed.data.scale) ?? 0) + range.max);
  }

  let answered = 0;
  for (const response of input.responses) {
    const key = itemKey.get(response.itemId);
    if (!key) continue;
    const parsed = LikertResponseSchema.safeParse(response.value);
    if (!parsed.success) continue;
    const rating = parsed.data.rating;
    if (rating < range.min || rating > range.max) continue;
    const value = key.reverse ? range.min + range.max - rating : rating;
    sum.set(key.scale, (sum.get(key.scale) ?? 0) + value);
    answered += 1;
  }

  const scores: LikertScores = {
    type: '',
    total: input.items.length,
    answered,
    scales: {},
  };

  for (const scale of scales) {
    const value = sum.get(scale) ?? 0;
    const ceiling = max.get(scale) ?? 0;
    // The band is cut on the exact ratio, not the rounded percent: 15/45 is
    // 33.33 and belongs to "Sedang" even though the card prints 33.
    const exact = ceiling === 0 ? 0 : (value / ceiling) * 100;
    const entry: LikertScaleScore = {
      score: value,
      max: ceiling,
      percent: percent(value, ceiling),
    };
    const band = bandFor(exact, config);
    if (band) entry.band = band;
    scores.scales[scale] = entry;
  }

  const winner = scales.reduce<string | null>((best, scale) => {
    if (best === null) return scale;
    return scores.scales[scale].percent > scores.scales[best].percent
      ? scale
      : best;
  }, null);

  scores.type = winner ?? '';
  if (winner && scores.scales[winner].band) {
    scores.band = scores.scales[winner].band;
  }

  const patternCode = scores.band
    ? `${scores.type}_${bandCode(scores.band)}`
    : scores.type;

  return { scores, patternCode };
}
