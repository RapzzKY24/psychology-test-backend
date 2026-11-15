import {
  OptionScaleItemContentSchema,
  OptionScaleResponseSchema,
  optionScalePoints,
} from './schemas/option-scale';

export interface OptionScaleScore {
  /** Raw sum of the weights of the picked options. */
  score: number;
  /** Sum of the best option of every item feeding the scale. */
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
 * Scores a three-option inventory: every item carries the weight of each option
 * (`[2, 1, 0]` when it does not say, `[0, 1, 0]` for 16PF's right/wrong factor
 * B), so a pick is worth exactly what the workbook's formula gives it. The raw
 * sum per factor is then read against the test's `NormTable` rows (ADR-011),
 * which is what turns 16PF's scores into stens.
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

  /** itemId -> factor, weights and the last pickable option. */
  const itemKey = new Map<
    string,
    { scale: string; points: number[]; last: number }
  >();
  const order: string[] = [];
  const buckets = new Map<string, { sum: number; max: number }>();

  for (const item of input.items) {
    const parsed = OptionScaleItemContentSchema.safeParse(item.content);
    if (!parsed.success) continue;
    const points = optionScalePoints(parsed.data);
    const last = parsed.data.options.length - 1;
    itemKey.set(item.id, { scale: parsed.data.scale, points, last });
    if (!buckets.has(parsed.data.scale)) {
      buckets.set(parsed.data.scale, { sum: 0, max: 0 });
      order.push(parsed.data.scale);
    }
    const bucket = buckets.get(parsed.data.scale)!;
    bucket.max += Math.max(...points);
  }

  let answered = 0;
  for (const response of input.responses) {
    const key = itemKey.get(response.itemId);
    if (!key) continue;
    const parsed = OptionScaleResponseSchema.safeParse(response.value);
    if (!parsed.success) continue;
    const chosen = parsed.data.chosen;
    if (chosen > key.last) continue;
    const bucket = buckets.get(key.scale);
    if (!bucket) continue;
    bucket.sum += key.points[chosen] ?? 0;
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
