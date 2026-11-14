import { z } from 'zod';

/**
 * One interest field. Uppercased on parse so the seed, the builder and the
 * scorer never disagree about casing — RMIB uses short codes (OUT, ME, PRS)
 * and one of them, `S.S`, keeps the workbook's dot.
 */
const ScaleSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(6)
  .regex(/^[A-Z][A-Z.]*$/, 'scale must start with a letter');

/**
 * A group of occupations the participant ranks from 1 (most liked) to N (least
 * liked). `mapping` lines up with `options` and says which field each position
 * scores — the key, never sent to the participant.
 *
 * `femaleOptions` is the same group worded for female respondents. RMIB ships
 * two lists per group (some positions name a different occupation entirely),
 * and the mapping is positional, so both lists score the same way.
 */
export const RankGroupItemContentSchema = z
  .object({
    question: z.string().trim().min(1).max(2000).optional(),
    options: z.array(z.string().trim().min(1).max(120)).min(2).max(12),
    femaleOptions: z
      .array(z.string().trim().min(1).max(120))
      .min(2)
      .max(12)
      .optional(),
    mapping: z.array(ScaleSchema).min(2).max(12),
  })
  .superRefine((data, ctx) => {
    if (data.mapping.length !== data.options.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'mapping must have one scale per option',
        path: ['mapping'],
      });
    }
    if (
      data.femaleOptions &&
      data.femaleOptions.length !== data.options.length
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'femaleOptions must have the same length as options',
        path: ['femaleOptions'],
      });
    }
  });

export type RankGroupItemContent = z.infer<typeof RankGroupItemContentSchema>;

export function parseRankGroupItem(
  content: unknown,
): RankGroupItemContent | null {
  const parsed = RankGroupItemContentSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

/**
 * A complete ranking: one rank per option, each number used exactly once.
 * The family-wide shape only bounds the numbers; the per-item schema built by
 * `rankGroupResponseSchema` adds the length and the permutation check.
 */
export const RankGroupResponseSchema = z.object({
  ranks: z.array(z.number().int().min(1).max(12)).min(2).max(12),
});

export type RankGroupResponse = z.infer<typeof RankGroupResponseSchema>;

/**
 * The answer shape for **one** group: as many ranks as that group has options,
 * each number used once. A half-filled group is rejected, because a missing
 * rank would silently count as "not ranked" and skew every field it touches.
 */
export function rankGroupResponseSchema(itemContent?: unknown): z.ZodSchema {
  const item = parseRankGroupItem(itemContent);
  const count = item ? item.options.length : 12;
  return z
    .object({
      ranks: z.array(z.number().int().min(1).max(count)).length(count),
    })
    .superRefine((value, ctx) => {
      if (new Set(value.ranks).size !== count) {
        ctx.addIssue({
          code: 'custom',
          message: `each rank from 1 to ${count} must be used once`,
          path: ['ranks'],
        });
      }
    });
}

/** Fields in the order they first appear in the item list (the tie-breaker). */
export function rankGroupScales(items: { content: unknown }[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const parsed = parseRankGroupItem(item.content);
    if (!parsed) continue;
    for (const scale of parsed.mapping) seen.add(scale);
  }
  return [...seen];
}

/**
 * Every pattern code this item set can produce: any field can end up the
 * strongest. Publish uses it to demand one interpretation per field.
 */
export function rankGroupPatternCodes(items: { content: unknown }[]): string[] {
  return rankGroupScales(items);
}
