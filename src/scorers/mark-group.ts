import {
  MarkGroupResponseSchema,
  markGroupScales,
  parseMarkGroupConfig,
  parseMarkGroupItem,
} from './schemas/mark-group';

export interface MarkGroupScaleScore {
  /** Likes minus dislikes over every activity that loads on this field. */
  score: number;
  /** Most negative score this field can reach (all its activities disliked). */
  min: number;
  /** Most positive score this field can reach (all its activities liked). */
  max: number;
  /** Percentile from the norm table, 0-100; 0 when the raw score has no row. */
  percent: number;
  /** Band the percentile falls in, or null when the norm table does not cover it. */
  band: string | null;
}

export interface MarkGroupScores {
  answered: number;
  total: number;
  /** Norm table the percentiles were read from; null when the attempt has none. */
  gender: string | null;
  /** Three strongest fields, strongest first. */
  type: string;
  dominant: string;
  scales: Record<string, MarkGroupScaleScore>;
  /**
   * The validity scale: how many of the flagged activities carry a mark. A
   * protocol that skips most of them is not usable, and the source bands this
   * count rather than a percentile.
   */
  verification: { raw: number; max: number; band: string | null };
}

export interface MarkGroupScorerOutput {
  scores: MarkGroupScores;
  patternCode: string;
}

/** First band whose `max` covers the value; null when none does. */
function bandOf(
  bands: { max: number; label: string }[] | undefined,
  value: number,
): string | null {
  if (!bands) return null;
  for (const band of bands) {
    if (value <= band.max) return band.label;
  }
  return null;
}

/**
 * A mark adds one to every field the activity loads on, a dislike takes one
 * away. The raw score is then read against the norm table for the attempt's
 * sex — Kuder ships two tables, which is why a gendered test cannot be scored
 * before the participant declares one.
 */
export function scoreMarkGroup(input: {
  items: { id: string; content: unknown }[];
  responses: { itemId: string; value: unknown }[];
  scoringConfig?: unknown;
  gender?: string | null;
}): MarkGroupScorerOutput {
  const config = parseMarkGroupConfig(input.scoringConfig);
  const scales = markGroupScales(input.items);
  const responseByItem = new Map<string, unknown>();
  for (const response of input.responses) {
    responseByItem.set(response.itemId, response.value);
  }

  const raw = new Map<string, number>(scales.map((scale) => [scale, 0]));
  const memberships = new Map<string, number>(
    scales.map((scale) => [scale, 0]),
  );

  let answered = 0;
  let verificationRaw = 0;
  let verificationMax = 0;

  for (const item of input.items) {
    const content = parseMarkGroupItem(item.content);
    if (!content) continue;

    // The bounds come from the items, not from the answers: every activity
    // that loads on a field can move it by one, whether or not it was marked.
    for (const codes of content.mapping) {
      for (const code of codes) {
        memberships.set(code, (memberships.get(code) ?? 0) + 1);
      }
    }

    const flagged = new Set(content.verification ?? []);
    verificationMax += flagged.size;

    const parsed = MarkGroupResponseSchema.safeParse(
      responseByItem.get(item.id),
    );
    if (!parsed.success) continue;
    answered += 1;

    const marked = new Set<number>();
    for (const index of parsed.data.liked) {
      marked.add(index);
      for (const code of content.mapping[index] ?? []) {
        raw.set(code, (raw.get(code) ?? 0) + 1);
      }
    }
    for (const index of parsed.data.disliked) {
      marked.add(index);
      for (const code of content.mapping[index] ?? []) {
        raw.set(code, (raw.get(code) ?? 0) - 1);
      }
    }
    for (const index of marked) {
      if (flagged.has(index)) verificationRaw += 1;
    }
  }

  const gender =
    input.gender === 'MALE' || input.gender === 'FEMALE' ? input.gender : null;
  const normRows = gender ? config.norms?.[gender] : undefined;

  const scores: Record<string, MarkGroupScaleScore> = {};
  for (const code of scales) {
    const score = raw.get(code) ?? 0;
    const count = memberships.get(code) ?? 0;
    // Positional table: row N is the percentile of a raw score of N. A score
    // past the last row reads the top row (the source's VLOOKUP is an
    // approximate match, so 120 and 99 land on the same percentile). A
    // negative score has no row at all — the table starts at 0 — so the field
    // keeps its raw value but reports no percentile.
    const table = normRows?.[code];
    const row = table && score >= 0 ? Math.min(score, table.length - 1) : -1;
    const percentile = row === -1 ? undefined : table?.[row];
    const percent = percentile === undefined ? 0 : Math.round(percentile * 100);
    scores[code] = {
      score,
      min: -count,
      max: count,
      percent,
      band: percentile === undefined ? null : bandOf(config.bands, percent),
    };
  }

  // Stable sort: an exact tie keeps the field that appears first in the item
  // list, the same rule the other tally families use.
  const ordered = [...scales].sort(
    (a, b) => scores[b].percent - scores[a].percent,
  );
  const dominant = ordered[0] ?? '';

  return {
    scores: {
      answered,
      total: input.items.length,
      gender,
      type: ordered.slice(0, 3).join('_'),
      dominant,
      scales: scores,
      verification: {
        raw: verificationRaw,
        max: verificationMax,
        band: bandOf(config.verificationBands, verificationRaw),
      },
    },
    patternCode: dominant,
  };
}
