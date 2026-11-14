import {
  DEFAULT_RATING_RANGE,
  LikertItemContentSchema,
  LikertResponseSchema,
  bandCode,
  likertPatternSection,
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
  /** Scales of the pattern section — this is the result the report reads. */
  scales: Record<string, LikertScaleScore>;
  /**
   * Present only when the items are split into sections (MSAI rates the same
   * twelve roles three ways). The pattern section is repeated here, so a caller
   * that wants the whole picture reads one place.
   */
  sections?: Record<string, Record<string, LikertScaleScore>>;
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

/** Running totals of one scale inside one section. */
interface Bucket {
  sum: number;
  max: number;
}

/**
 * Sums the ratings per scale, flips the reverse-keyed items, and takes the
 * scale that reaches the highest percent of its own ceiling.
 *
 * There is no right answer: the profile is the result. The pattern code is
 * `SCALE_BAND` when the test declares bands (`E_TINGGI`) and the bare scale
 * otherwise, so publish can demand exactly the interpretations this test emits.
 *
 * An item may name a `section`. Scales are then summed per section and the
 * result (`scales`, `type`, `patternCode`) comes from
 * `scoringConfig.patternSection` — MSAI rates twelve roles for behaviour,
 * effectiveness and importance, and only the behaviour ratings decide the
 * profile. Without sections the output is exactly what it always was.
 */
export function scoreLikert(input: {
  items: { id: string; content: unknown }[];
  responses: { itemId: string; value: unknown }[];
  scoringConfig?: unknown;
}): LikertScorerOutput {
  const config = parseLikertConfig(input.scoringConfig);
  const range = config.ratingRange ?? DEFAULT_RATING_RANGE;

  /** section -> scale -> totals. The empty section is "no section declared". */
  const buckets = new Map<string, Map<string, Bucket>>();
  const sectionOrder: string[] = [];
  const bucketOf = (section: string): Map<string, Bucket> => {
    let bucket = buckets.get(section);
    if (!bucket) {
      bucket = new Map<string, Bucket>();
      buckets.set(section, bucket);
      sectionOrder.push(section);
    }
    return bucket;
  };

  /** itemId -> where the rating goes and whether it is flipped. */
  const itemKey = new Map<
    string,
    { section: string; scale: string; reverse: boolean }
  >();
  for (const item of input.items) {
    const parsed = LikertItemContentSchema.safeParse(item.content);
    if (!parsed.success) continue;
    const section = parsed.data.section ?? '';
    itemKey.set(item.id, {
      section,
      scale: parsed.data.scale,
      reverse: parsed.data.reverse === true,
    });
    const scales = bucketOf(section);
    const bucket = scales.get(parsed.data.scale) ?? { sum: 0, max: 0 };
    bucket.max += range.max;
    scales.set(parsed.data.scale, bucket);
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
    const bucket = buckets.get(key.section)?.get(key.scale);
    if (!bucket) continue;
    bucket.sum += value;
    answered += 1;
  }

  const scored = (bucket: Map<string, Bucket>) => {
    const out: Record<string, LikertScaleScore> = {};
    for (const [scale, { sum, max }] of bucket) {
      // The band is cut on the exact ratio, not the rounded percent: 15/45 is
      // 33.33 and belongs to "Sedang" even though the card prints 33.
      const exact = max === 0 ? 0 : (sum / max) * 100;
      const entry: LikertScaleScore = {
        score: sum,
        max,
        percent: percent(sum, max),
      };
      const band = bandFor(exact, config);
      if (band) entry.band = band;
      out[scale] = entry;
    }
    return out;
  };

  const hasSections = sectionOrder.some((section) => section !== '');
  const patternSection = likertPatternSection(input.items, input.scoringConfig);
  const resultBucket =
    buckets.get(patternSection ?? '') ??
    buckets.get(sectionOrder[0] ?? '') ??
    new Map<string, Bucket>();

  const scores: LikertScores = {
    type: '',
    total: input.items.length,
    answered,
    scales: scored(resultBucket),
  };

  if (hasSections) {
    scores.sections = {};
    for (const section of sectionOrder) {
      if (!section) continue;
      scores.sections[section] = scored(buckets.get(section)!);
    }
  }

  const scales = Object.keys(scores.scales);
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
