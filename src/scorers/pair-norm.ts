import {
  PairNormResponseSchema,
  pairNormScales,
  parsePairNormConfig,
  parsePairNormItem,
} from './schemas/pair-norm';
import type { PairNormConfig } from './schemas/pair-norm';

export interface PairNormScaleScore {
  /** Printed name of the need, when the config declares one. */
  label?: string;
  /** Times this need was picked, either as statement A or as statement B. */
  score: number;
  /** Picks that could have reached this need — 28 for every EPPS need. */
  max: number;
  /**
   * Percentile of `score` in the norm table. Falls back to the share of `max`
   * when the test ships no table, so the bar always has something to draw.
   */
  percent: number;
  /** Category the percentile falls in; null without a norm table. */
  band: string | null;
}

export interface PairNormConsistency {
  /** Pairs whose two items were answered the same way. */
  raw: number;
  max: number;
  band: string | null;
  /** False when the count falls in a band the source calls doubtful. */
  valid: boolean;
}

export interface PairNormScores {
  /** The need with the highest percentile; also the pattern code. */
  type: string;
  total: number;
  answered: number;
  /** Norm set and table actually read, so a re-score reports the same one. */
  normSet: string | null;
  gender: string | null;
  scales: Record<string, PairNormScaleScore>;
  /** Present only when the test declares repeated items. */
  consistency?: PairNormConsistency;
}

export interface PairNormScorerOutput {
  scores: PairNormScores;
  patternCode: string;
}

/** First band whose `max` covers the value, `null` for an open top band. */
function bandOf(
  bands: { max: number | null; label: string }[] | undefined,
  value: number,
): string | null {
  if (!bands) return null;
  for (const band of bands) {
    if (band.max === null || value <= band.max) return band.label;
  }
  return null;
}

/**
 * Picks the table for the attempt's sex. A set that ships one table serves both
 * sexes; an unknown or undeclared sex falls back to the first table so a score
 * is still produced (publish refuses such a test before it can be taken).
 */
function tableFor(
  config: PairNormConfig,
  gender: string | null,
): { set: string; sex: string; columns: Record<string, number[]> } | null {
  if (!config.norms) return null;
  const set =
    config.normSet && config.norms[config.normSet]
      ? config.normSet
      : Object.keys(config.norms)[0];
  if (!set) return null;
  const table = config.norms[set];
  const sexes = Object.keys(table);
  if (sexes.length === 0) return null;
  const sex = gender && sexes.includes(gender) ? gender : sexes[0];
  const columns = table[sex as 'MALE' | 'FEMALE'];
  if (!columns) return null;
  return { set, sex, columns };
}

/** Percentile of a raw score; the last row covers anything above the table. */
function percentileOf(
  column: number[] | undefined,
  raw: number,
): number | null {
  if (!column || column.length === 0) return null;
  const value = column[Math.min(Math.max(raw, 0), column.length - 1)];
  return typeof value === 'number' ? Math.min(value, 100) : null;
}

/**
 * Counts the need of the picked statement, reads each need's percentile, and
 * names the need that stands highest.
 *
 * An item whose two statements map to the same need cannot separate them, so it
 * is dropped from both the score and the ceiling. EPPS relies on that: its 15
 * diagonal items keep every need's ceiling at 28 and exist only to repeat
 * another item for the consistency check.
 */
export function scorePairNorm(input: {
  /** `order` is the printed item number; the consistency pairs point at it. */
  items: { id: string; order?: number; content: unknown }[];
  responses: { itemId: string; value: unknown }[];
  scoringConfig?: unknown;
  gender?: string | null;
}): PairNormScorerOutput {
  const config = parsePairNormConfig(input.scoringConfig);
  const scales = pairNormScales(input.items, config);
  const counts = new Map<string, number>(scales.map((scale) => [scale, 0]));
  const max = new Map<string, number>(scales.map((scale) => [scale, 0]));

  /** itemId -> the need each statement scores, plus the printed item number. */
  const items = new Map<
    string,
    { mapping: [string, string]; order: number; scored: boolean }
  >();

  for (const [index, item] of input.items.entries()) {
    const parsed = parsePairNormItem(item.content);
    if (!parsed) continue;
    const [left, right] = parsed.mapping;
    const scored = left !== right;
    const order = item.order ?? index + 1;
    items.set(item.id, { mapping: [left, right], order, scored });

    if (!scored) continue;
    if (counts.has(left)) max.set(left, (max.get(left) ?? 0) + 1);
    if (counts.has(right)) max.set(right, (max.get(right) ?? 0) + 1);
  }

  let answered = 0;
  /** itemId -> chosen index, kept for the consistency check. */
  const picked = new Map<string, number>();
  for (const response of input.responses) {
    const entry = items.get(response.itemId);
    if (!entry) continue;
    const parsed = PairNormResponseSchema.safeParse(response.value);
    if (!parsed.success) continue;
    picked.set(response.itemId, parsed.data.chosen);
    answered += 1;
    if (!entry.scored) continue;

    const scale = entry.mapping[parsed.data.chosen];
    if (counts.get(scale) === undefined) continue;
    counts.set(scale, (counts.get(scale) ?? 0) + 1);
  }

  const table = config ? tableFor(config, input.gender ?? null) : null;
  const scores: PairNormScores = {
    type: '',
    total: input.items.length,
    answered,
    normSet: table?.set ?? null,
    gender: table?.sex ?? null,
    scales: {},
  };

  for (const scale of scales) {
    const score = counts.get(scale) ?? 0;
    const ceiling = max.get(scale) ?? 0;
    const percentile = table ? percentileOf(table.columns[scale], score) : null;
    const entry: PairNormScaleScore = {
      score,
      max: ceiling,
      percent:
        percentile ?? (ceiling > 0 ? Math.round((score / ceiling) * 100) : 0),
      band: percentile === null ? null : bandOf(config?.categories, percentile),
    };
    const label = config?.scales.find(
      (candidate) => candidate.code === scale,
    )?.label;
    if (label) entry.label = label;
    scores.scales[scale] = entry;
  }

  const consistency = consistencyOf(config, items, picked);
  if (consistency) scores.consistency = consistency;

  scores.type = dominant(scales, scores.scales, config);

  return { scores, patternCode: scores.type };
}

/**
 * How many repeated items were answered the same way. EPPS prints 15 pairs and
 * treats a protocol with fewer than 10 matches as doubtful, which is why the
 * result carries `valid` next to the count.
 */
function consistencyOf(
  config: PairNormConfig | null,
  items: Map<string, { order: number }>,
  picked: Map<string, number>,
): PairNormConsistency | null {
  const pairs = config?.consistency?.pairs;
  if (!pairs?.length) return null;

  const byOrder = new Map<number, string>();
  for (const [itemId, entry] of items) byOrder.set(entry.order, itemId);

  let raw = 0;
  for (const [a, b] of pairs) {
    const left = picked.get(byOrder.get(a) ?? '');
    const right = picked.get(byOrder.get(b) ?? '');
    if (left === undefined || right === undefined) continue;
    if (left === right) raw += 1;
  }

  const bands = config?.consistency?.bands;
  const band = bandOf(bands, raw);
  // The top band is the usable one: EPPS calls a protocol doubtful below 10 of
  // its 15 matches, so "Konsisten" is the last row and everything else is not.
  const valid = bands ? band === bands[bands.length - 1].label : false;

  return { raw, max: pairs.length, band, valid };
}

/** Highest percentile, tie broken by `scoringConfig.tieBreak` then scale order. */
function dominant(
  scales: string[],
  scores: Record<string, PairNormScaleScore>,
  config: PairNormConfig | null,
): string {
  if (scales.length === 0) return '';

  const top = Math.max(...scales.map((scale) => scores[scale]?.percent ?? 0));
  const leaders = scales.filter(
    (scale) => (scores[scale]?.percent ?? 0) === top,
  );
  if (leaders.length === 1) return leaders[0];

  if (config?.tieBreak && leaders.includes(config.tieBreak))
    return config.tieBreak;

  return leaders[0];
}
