import {
  parseStyleGridConfig,
  parseStyleGridItem,
  StyleGridResponseSchema,
} from './schemas/style-grid';
import type { StyleGridConfig } from './schemas/style-grid';

export interface StyleGridScaleScore {
  /** Printed name from the config, so the result page need not know the codes. */
  label?: string;
  /** Picks landing on this scale plus its `correction`. */
  score: number;
  /** Statement slots keyed to this scale — the most a participant can score. */
  max: number;
  correction: number;
}

export interface StyleGridDimensionScore {
  label?: string;
  /** Sum of the member scales' corrected scores. */
  score: number;
  /** Value the step table assigns to `score`. */
  level: number;
  /** `level` is strictly above the configured cut. */
  high: boolean;
}

export interface StyleGridScores {
  total: number;
  answered: number;
  scales: Record<string, StyleGridScaleScore>;
  dimensions: Record<string, StyleGridDimensionScore>;
  /** Top value of the step table, so a level can be drawn as a percentage. */
  maxLevel: number;
  /** The style matching the high/low pattern; null when the config is unusable. */
  profile: { code: string; label: string } | null;
}

export interface StyleGridScorerOutput {
  scores: StyleGridScores;
  patternCode: string;
}

/**
 * Tallies each picked statement into its scale, adds the scale's correction,
 * sums the scales into dimensions, converts every dimension with the step
 * table, then reads the above/below-cut pattern as a style.
 *
 * The correction is added after tallying, not per pick: the source workbook's
 * `KOREKSI` row is one constant per column, and its `JUMLAH` is
 * `count(A) + count(B) + KOREKSI`.
 */
export function scoreStyleGrid(input: {
  items: { id: string; content: unknown }[];
  responses: { itemId: string; value: unknown }[];
  scoringConfig?: unknown;
}): StyleGridScorerOutput {
  const config = parseStyleGridConfig(input.scoringConfig);
  if (!config) {
    return {
      scores: {
        total: input.items.length,
        answered: 0,
        scales: {},
        dimensions: {},
        maxLevel: 0,
        profile: null,
      },
      patternCode: '',
    };
  }

  const counts = new Map<string, number>(
    config.scales.map((scale) => [scale.code, 0]),
  );
  const max = new Map<string, number>(
    config.scales.map((scale) => [scale.code, 0]),
  );

  /** itemId -> the scale each statement scores. */
  const itemScales = new Map<string, string[]>();
  for (const item of input.items) {
    const parsed = parseStyleGridItem(item.content);
    if (!parsed) continue;
    itemScales.set(item.id, parsed.mapping);
    // One pick per item, so a scale named twice (MSDT's diagonal items) still
    // caps at one point — not two.
    for (const scale of new Set(parsed.mapping)) {
      if (max.has(scale)) max.set(scale, (max.get(scale) ?? 0) + 1);
    }
  }

  let answered = 0;
  for (const response of input.responses) {
    const mapping = itemScales.get(response.itemId);
    if (!mapping) continue;
    const parsed = StyleGridResponseSchema.safeParse(response.value);
    if (!parsed.success) continue;
    const scale = mapping[parsed.data.chosen];
    if (!scale || counts.get(scale) === undefined) continue;
    counts.set(scale, (counts.get(scale) ?? 0) + 1);
    answered += 1;
  }

  const scores: StyleGridScores = {
    total: input.items.length,
    answered,
    scales: {},
    dimensions: {},
    maxLevel: Math.max(...config.levels.map((level) => level.value)),
    profile: null,
  };

  for (const scale of config.scales) {
    const correction = scale.correction;
    scores.scales[scale.code] = {
      ...(scale.label ? { label: scale.label } : {}),
      score: (counts.get(scale.code) ?? 0) + correction,
      max: (max.get(scale.code) ?? 0) + correction,
      correction,
    };
  }

  for (const dimension of config.dimensions) {
    const score = dimension.scales.reduce(
      (sum, scale) => sum + (scores.scales[scale]?.score ?? 0),
      0,
    );
    const level = levelFor(score, config);
    scores.dimensions[dimension.code] = {
      ...(dimension.label ? { label: dimension.label } : {}),
      score,
      level,
      high: level > config.cut,
    };
  }

  const profile = config.profiles.find((candidate) =>
    config.dimensions.every((dimension) => {
      const high = scores.dimensions[dimension.code]?.high ?? false;
      return candidate.high.includes(dimension.code) ? high : !high;
    }),
  );

  if (profile) {
    scores.profile = { code: profile.code, label: profile.label };
  }

  return { scores, patternCode: profile?.code ?? '' };
}

/** First row of the step table that covers `score`; the last row may be open. */
function levelFor(score: number, config: StyleGridConfig): number {
  const row = config.levels.find(
    (entry) => entry.max === null || score <= entry.max,
  );
  return row?.value ?? 0;
}
