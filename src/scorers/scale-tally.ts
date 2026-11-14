import {
  ScaleTallyItemContentSchema,
  ScaleTallyResponseSchema,
  scaleTallyScales,
} from './schemas/scale-tally';

/** RIASEC reports the three strongest interests, so the code is three letters. */
const CODE_LENGTH = 3;

export interface ScaleTallyScaleScore {
  score: number;
  /** Items on this scale — the most a participant can score here. */
  max: number;
  percent: number;
}

export interface ScaleTallyScores {
  /** Strongest scales first, e.g. "RIA". Shorter when the test has < 3 scales. */
  type: string;
  /** First letter of `type`; also the pattern code. */
  dominant: string;
  total: number;
  answered: number;
  scales: Record<string, ScaleTallyScaleScore>;
}

export interface ScaleTallyScorerOutput {
  scores: ScaleTallyScores;
  patternCode: string;
}

function percent(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 100);
}

/**
 * Counts the agreeing answers per scale, then ranks the scales.
 *
 * There is no right answer here: a "Ya" adds one point to the scale the
 * statement belongs to, and the ranking is the result. Ties fall back to the
 * order the scales first appear in the item list, so the same answers always
 * produce the same code.
 */
export function scoreScaleTally(input: {
  items: { id: string; content: unknown }[];
  responses: { itemId: string; value: unknown }[];
}): ScaleTallyScorerOutput {
  const scales = scaleTallyScales(input.items);
  const max = new Map<string, number>(scales.map((scale) => [scale, 0]));
  const score = new Map<string, number>(scales.map((scale) => [scale, 0]));

  /** itemId -> the scale a "Ya" on that item scores. */
  const itemScale = new Map<string, string>();
  for (const item of input.items) {
    const parsed = ScaleTallyItemContentSchema.safeParse(item.content);
    if (!parsed.success) continue;
    itemScale.set(item.id, parsed.data.scale);
    max.set(parsed.data.scale, (max.get(parsed.data.scale) ?? 0) + 1);
  }

  let answered = 0;
  for (const response of input.responses) {
    const scale = itemScale.get(response.itemId);
    if (!scale) continue;
    const parsed = ScaleTallyResponseSchema.safeParse(response.value);
    if (!parsed.success) continue;
    answered += 1;
    if (parsed.data.chosen === 0) {
      score.set(scale, (score.get(scale) ?? 0) + 1);
    }
  }

  const scores: ScaleTallyScores = {
    type: '',
    dominant: '',
    total: input.items.length,
    answered,
    scales: {},
  };

  for (const scale of scales) {
    const value = score.get(scale) ?? 0;
    const ceiling = max.get(scale) ?? 0;
    scores.scales[scale] = {
      score: value,
      max: ceiling,
      percent: percent(value, ceiling),
    };
  }

  const ranked = [...scales].sort((a, b) => {
    const delta = (score.get(b) ?? 0) - (score.get(a) ?? 0);
    if (delta !== 0) return delta;
    // Item order, not alphabetical: it is the only stable, data-driven rule.
    return scales.indexOf(a) - scales.indexOf(b);
  });

  scores.type = ranked.slice(0, CODE_LENGTH).join('');
  scores.dominant = ranked[0] ?? '';

  return { scores, patternCode: scores.dominant };
}
