import { z } from 'zod';
import {
  ChoiceTallyItemContentSchema,
  ChoiceTallyResponseSchema,
  choiceTallyScales,
} from './schemas/choice-tally';

/** Optional settings a tally test can carry in `Test.scoringConfig`. */
const ChoiceTallyConfigSchema = z.object({
  /** Scale that wins when no scale is strictly ahead of the others. */
  tieBreak: z.string().trim().toUpperCase().min(1).max(4).optional(),
});

export interface ChoiceTallyScaleScore {
  score: number;
  /** Options on this scale — the most a participant can score here. */
  max: number;
  percent: number;
}

export interface ChoiceTallyScores {
  /** The winning scale; also the pattern code. */
  type: string;
  total: number;
  answered: number;
  scales: Record<string, ChoiceTallyScaleScore>;
}

export interface ChoiceTallyScorerOutput {
  scores: ChoiceTallyScores;
  patternCode: string;
}

function percent(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 100);
}

/**
 * Counts the picked option's scale, then takes the scale that is strictly ahead
 * of every other one.
 *
 * A tie has no winner, so it resolves to `scoringConfig.tieBreak` when the test
 * declares one — AQ's workbook maps every tied triple to Camper — and to the
 * first scale in item order otherwise. The rule reproduces AQ's 136-row
 * lookup table exactly; see the seed notes in feature 09.
 */
export function scoreChoiceTally(input: {
  items: { id: string; content: unknown }[];
  responses: { itemId: string; value: unknown }[];
  scoringConfig?: unknown;
}): ChoiceTallyScorerOutput {
  const scales = choiceTallyScales(input.items);
  const counts = new Map<string, number>(scales.map((scale) => [scale, 0]));
  const max = new Map<string, number>(scales.map((scale) => [scale, 0]));

  /** itemId -> the scale each option feeds. */
  const itemScales = new Map<string, string[]>();
  for (const item of input.items) {
    const parsed = ChoiceTallyItemContentSchema.safeParse(item.content);
    if (!parsed.success) continue;
    itemScales.set(item.id, parsed.data.mapping);
    for (const scale of parsed.data.mapping) {
      max.set(scale, (max.get(scale) ?? 0) + 1);
    }
  }

  let answered = 0;
  for (const response of input.responses) {
    const mapping = itemScales.get(response.itemId);
    if (!mapping) continue;
    const parsed = ChoiceTallyResponseSchema.safeParse(response.value);
    if (!parsed.success) continue;
    const scale = mapping[parsed.data.chosen];
    if (!scale || counts.get(scale) === undefined) continue;
    counts.set(scale, (counts.get(scale) ?? 0) + 1);
    answered += 1;
  }

  const scores: ChoiceTallyScores = {
    type: '',
    total: input.items.length,
    answered,
    scales: {},
  };
  for (const scale of scales) {
    const value = counts.get(scale) ?? 0;
    const ceiling = max.get(scale) ?? 0;
    scores.scales[scale] = {
      score: value,
      max: ceiling,
      percent: percent(value, ceiling),
    };
  }

  scores.type = winner(scales, counts, input.scoringConfig);

  return { scores, patternCode: scores.type };
}

/** The single scale strictly ahead of the rest, else the configured tie-break. */
function winner(
  scales: string[],
  counts: Map<string, number>,
  scoringConfig: unknown,
): string {
  if (scales.length === 0) return '';

  const top = Math.max(...scales.map((scale) => counts.get(scale) ?? 0));
  const leaders = scales.filter((scale) => (counts.get(scale) ?? 0) === top);
  if (leaders.length === 1) return leaders[0];

  const config = ChoiceTallyConfigSchema.safeParse(scoringConfig ?? {});
  const tieBreak = config.success ? config.data.tieBreak : undefined;
  if (tieBreak && scales.includes(tieBreak)) return tieBreak;

  // First of the tied scales in item order — never a scale that scored less.
  return leaders[0];
}
