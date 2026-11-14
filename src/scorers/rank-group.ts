import {
  RankGroupResponseSchema,
  parseRankGroupItem,
  rankGroupScales,
} from './schemas/rank-group';

export interface RankGroupScaleScore {
  /** Sum of the ranks this field received — lower is a stronger interest. */
  score: number;
  /** Lowest reachable sum (every option ranked 1st). */
  min: number;
  /** Highest reachable sum (every option ranked last). */
  max: number;
  /** 100 = the field was ranked first everywhere, 0 = last everywhere. */
  percent: number;
}

export interface RankGroupScores {
  /** Top three fields, strongest first (RMIB prints a three-field code). */
  type: string;
  /** The strongest field; also the pattern code. */
  dominant: string;
  total: number;
  answered: number;
  scales: Record<string, RankGroupScaleScore>;
}

export interface RankGroupScorerOutput {
  scores: RankGroupScores;
  patternCode: string;
}

/**
 * Sums the rank each option received into the field it belongs to. A low sum
 * means the participant kept choosing that field first, so the strength is the
 * distance from the worst possible sum, normalised per field.
 *
 * The sum itself is not comparable across instruments with a different number
 * of groups, which is why `percent` is what the report reads.
 */
export function scoreRankGroup(input: {
  items: { id: string; content: unknown }[];
  responses: { itemId: string; value: unknown }[];
}): RankGroupScorerOutput {
  const scales = rankGroupScales(input.items);
  const sum = new Map<string, number>(scales.map((scale) => [scale, 0]));
  const min = new Map<string, number>(scales.map((scale) => [scale, 0]));
  const max = new Map<string, number>(scales.map((scale) => [scale, 0]));

  /** itemId -> the field of each option, in option order. */
  const itemKey = new Map<string, string[]>();
  for (const item of input.items) {
    const parsed = parseRankGroupItem(item.content);
    if (!parsed) continue;
    itemKey.set(item.id, parsed.mapping);
    for (const scale of parsed.mapping) {
      min.set(scale, (min.get(scale) ?? 0) + 1);
      max.set(scale, (max.get(scale) ?? 0) + parsed.options.length);
    }
  }

  let answered = 0;
  for (const response of input.responses) {
    const mapping = itemKey.get(response.itemId);
    if (!mapping) continue;
    const parsed = RankGroupResponseSchema.safeParse(response.value);
    if (!parsed.success) continue;
    const ranks = parsed.data.ranks;
    // A partial ranking would count missing positions as "not ranked" and
    // inflate the fields it does not mention, so it is skipped whole.
    if (ranks.length !== mapping.length) continue;
    if (new Set(ranks).size !== ranks.length) continue;

    ranks.forEach((rank, index) => {
      const scale = mapping[index];
      sum.set(scale, (sum.get(scale) ?? 0) + rank);
    });
    answered += 1;
  }

  const scores: RankGroupScores = {
    type: '',
    dominant: '',
    total: input.items.length,
    answered,
    scales: {},
  };

  for (const scale of scales) {
    const value = sum.get(scale) ?? 0;
    const low = min.get(scale) ?? 0;
    const high = max.get(scale) ?? 0;
    const span = high - low;
    scores.scales[scale] = {
      score: value,
      min: low,
      max: high,
      percent: span === 0 ? 0 : Math.round(((high - value) / span) * 100),
    };
  }

  const ordered = [...scales].sort(
    (a, b) => scores.scales[b].percent - scores.scales[a].percent,
  );
  scores.type = ordered.slice(0, 3).join('_');
  scores.dominant = ordered[0] ?? '';

  return { scores, patternCode: scores.dominant };
}
