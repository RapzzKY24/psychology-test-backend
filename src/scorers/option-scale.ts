import {
  OptionScaleItemContentSchema,
  OptionScaleResponseSchema,
} from './schemas/option-scale';

export interface OptionScaleScore {
  /** Raw sum of the picked options, highest option = 2. */
  score: number;
  /** 2 x the number of items feeding the scale. */
  max: number;
  /** Standard ten from the test's norm table; null when no row covers the raw. */
  sten: number | null;
}

export interface OptionScaleScores {
  /** Factor with the highest sten (or raw when the norm is missing). */
  type: string;
  total: number;
  answered: number;
  /** Norm group read, e.g. `S1_L`; null when the attempt declared no schooling. */
  normGroup: string | null;
  /** Top of the sten scale, so the result page can draw the bar. */
  stenMax: number;
  scales: Record<string, OptionScaleScore>;
}

export interface OptionScaleScorerOutput {
  scores: OptionScaleScores;
  patternCode: string;
}

export interface OptionScaleNormRow {
  group: string;
  scale: string | null;
  rawMin: number;
  rawMax: number;
  outputValue: number;
  outputLabel: string | null;
}

/** 16PF's sten runs 1-10. */
const STEN_MAX = 10;

/**
 * 16PF's nine norm tables are keyed by schooling plus sex; the three `_LP`
 * tables exist for respondents whose sex was not recorded, so a table without a
 * sex-specific twin still answers.
 */
function normGroupOf(
  education: string | null | undefined,
  gender: string | null | undefined,
): string | null {
  if (!education) return null;
  if (gender === 'MALE') return `${education}_L`;
  if (gender === 'FEMALE') return `${education}_P`;
  return `${education}_LP`;
}

function stenOf(
  rows: OptionScaleNormRow[],
  group: string | null,
  scale: string,
  raw: number,
): number | null {
  if (!group) return null;
  const row = rows.find(
    (candidate) =>
      candidate.group === group &&
      candidate.scale === scale &&
      raw >= candidate.rawMin &&
      raw <= candidate.rawMax,
  );
  return row ? row.outputValue : null;
}

/**
 * Scores a three-option inventory: option 0 is the high pole, so it is worth 2,
 * option 1 worth 1 and option 2 worth 0 — `reverse` flips that for the items
 * whose printed order runs the other way. The raw sum per factor is then read
 * against the test's `NormTable` rows (ADR-011), which is what turns 16PF's
 * scores into stens.
 */
export function scoreOptionScale(input: {
  items: { id: string; content: unknown }[];
  responses: { itemId: string; value: unknown }[];
  normRows?: OptionScaleNormRow[];
  gender?: string | null;
  education?: string | null;
}): OptionScaleScorerOutput {
  const rows = input.normRows ?? [];
  const normGroup = normGroupOf(input.education, input.gender);

  /** itemId -> factor, option count and direction. */
  const itemKey = new Map<
    string,
    { scale: string; last: number; reverse: boolean }
  >();
  const order: string[] = [];
  const buckets = new Map<string, { sum: number; max: number }>();

  for (const item of input.items) {
    const parsed = OptionScaleItemContentSchema.safeParse(item.content);
    if (!parsed.success) continue;
    const last = parsed.data.options.length - 1;
    itemKey.set(item.id, {
      scale: parsed.data.scale,
      last,
      reverse: parsed.data.reverse === true,
    });
    if (!buckets.has(parsed.data.scale)) {
      buckets.set(parsed.data.scale, { sum: 0, max: 0 });
      order.push(parsed.data.scale);
    }
    const bucket = buckets.get(parsed.data.scale)!;
    bucket.max += last;
  }

  let answered = 0;
  for (const response of input.responses) {
    const key = itemKey.get(response.itemId);
    if (!key) continue;
    const parsed = OptionScaleResponseSchema.safeParse(response.value);
    if (!parsed.success) continue;
    const chosen = parsed.data.chosen;
    if (chosen > key.last) continue;
    // Option 0 is the high pole: picking it adds the full weight.
    const value = key.reverse ? chosen : key.last - chosen;
    const bucket = buckets.get(key.scale);
    if (!bucket) continue;
    bucket.sum += value;
    answered += 1;
  }

  const scales: Record<string, OptionScaleScore> = {};
  for (const [scale, { sum, max }] of buckets) {
    scales[scale] = {
      score: sum,
      max,
      sten: stenOf(rows, normGroup, scale, sum),
    };
  }

  // The profile has no single type, so `patternCode` names the strongest
  // factor: highest sten first, raw score as the tie-break when the norm is
  // missing, and print order when both agree.
  let type = order[0] ?? '';
  for (const scale of order) {
    const best = scales[type];
    const candidate = scales[scale];
    const bestSten = best.sten ?? -1;
    const candidateSten = candidate.sten ?? -1;
    if (
      candidateSten > bestSten ||
      (candidateSten === bestSten && candidate.score > best.score)
    ) {
      type = scale;
    }
  }

  return {
    scores: {
      type,
      total: input.items.length,
      answered,
      normGroup,
      stenMax: STEN_MAX,
      scales,
    },
    patternCode: type,
  };
}
