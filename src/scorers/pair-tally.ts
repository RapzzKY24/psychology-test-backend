import {
  PairItemContentSchema,
  PairResponseSchema,
} from './schemas/forced-choice-pair';
import { pairTallyScales, parsePairTallyConfig } from './schemas/pair-tally';
import type { PairTallyConfig } from './schemas/pair-tally';

export interface PairTallyScaleScore {
  score: number;
  /** Statements mapped to this scale — the most a participant can score here. */
  max: number;
  percent: number;
  /** Present only when the test declares `scoringConfig.bands`. */
  band?: string;
}

export interface PairTallyScores {
  /** The winning scale; also the pattern code. */
  type: string;
  total: number;
  answered: number;
  scales: Record<string, PairTallyScaleScore>;
  /** Averages over `scoringConfig.groups`, when the test declares them. */
  groups?: Record<string, number>;
}

export interface PairTallyScorerOutput {
  scores: PairTallyScores;
  patternCode: string;
}

function percent(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 100);
}

function bandFor(score: number, config: PairTallyConfig): string | undefined {
  if (!config.bands?.length) return undefined;
  const row = [...config.bands]
    .sort((a, b) => a.max - b.max)
    .find((entry) => score <= entry.max);
  return row?.label;
}

/**
 * Counts the scale of the picked statement, then takes the scale that is
 * strictly ahead of every other one.
 *
 * A tie has no winner, so it resolves to `scoringConfig.tieBreak` when the test
 * declares one and to the first scale in item order otherwise — the same rule
 * the other tally families use, so a blank attempt still yields a valid code.
 */
export function scorePairTally(input: {
  items: { id: string; content: unknown }[];
  responses: { itemId: string; value: unknown }[];
  scoringConfig?: unknown;
}): PairTallyScorerOutput {
  const config = parsePairTallyConfig(input.scoringConfig);
  const scales = pairTallyScales(input.items);
  const counts = new Map<string, number>(scales.map((scale) => [scale, 0]));
  const max = new Map<string, number>(scales.map((scale) => [scale, 0]));

  /** itemId -> the scale each statement scores. */
  const itemScales = new Map<string, string[]>();
  for (const item of input.items) {
    const parsed = PairItemContentSchema.safeParse(item.content);
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
    const parsed = PairResponseSchema.safeParse(response.value);
    if (!parsed.success) continue;
    const scale = mapping[parsed.data.chosen];
    if (!scale || counts.get(scale) === undefined) continue;
    counts.set(scale, (counts.get(scale) ?? 0) + 1);
    answered += 1;
  }

  const scores: PairTallyScores = {
    type: '',
    total: input.items.length,
    answered,
    scales: {},
  };

  for (const scale of scales) {
    const value = counts.get(scale) ?? 0;
    const ceiling = max.get(scale) ?? 0;
    const entry: PairTallyScaleScore = {
      score: value,
      max: ceiling,
      percent: percent(value, ceiling),
    };
    const band = bandFor(value, config);
    if (band) entry.band = band;
    scores.scales[scale] = entry;
  }

  if (config.groups?.length) {
    scores.groups = {};
    for (const group of config.groups) {
      const members = group.scales.filter((scale) => scores.scales[scale]);
      if (members.length === 0) continue;
      const sum = members.reduce(
        (acc, scale) => acc + scores.scales[scale].score,
        0,
      );
      scores.groups[group.name] =
        Math.round((sum / members.length) * 100) / 100;
    }
  }

  scores.type = winner(scales, counts, config);

  return { scores, patternCode: scores.type };
}

/** The single scale strictly ahead of the rest, else the configured tie-break. */
function winner(
  scales: string[],
  counts: Map<string, number>,
  config: PairTallyConfig,
): string {
  if (scales.length === 0) return '';

  const top = Math.max(...scales.map((scale) => counts.get(scale) ?? 0));
  const leaders = scales.filter((scale) => (counts.get(scale) ?? 0) === top);
  if (leaders.length === 1) return leaders[0];

  if (config.tieBreak && scales.includes(config.tieBreak))
    return config.tieBreak;

  // First of the tied scales in item order — never a scale that scored less.
  return leaders[0];
}
