import { z } from 'zod';

/**
 * One scale a choice can feed. Uppercased on parse so the seed, the builder and
 * the scorer never disagree about casing — AQ uses Q/Ca/Cl, a later inventory
 * may use short codes.
 */
const ScaleSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(4)
  .regex(/^[A-Z]+$/, 'scale must be A-Z');

/**
 * Pick one option; every option feeds a scale. Unlike `SCALE_TALLY` there is no
 * "no point" answer — one of the options always counts, which is how a forced
 * choice inventory like AQ is scored.
 *
 * `mapping` is the key: it lines up with `options` and says which scale each
 * answer adds a point to.
 */
export const ChoiceTallyItemContentSchema = z
  .object({
    question: z.string().trim().min(1).max(2000),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(8),
    mapping: z.array(ScaleSchema).min(2).max(8),
  })
  .superRefine((data, ctx) => {
    if (data.mapping.length !== data.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'mapping must have one scale per option',
        path: ['mapping'],
      });
    }
  });

export type ChoiceTallyItemContent = z.infer<
  typeof ChoiceTallyItemContentSchema
>;

export function parseChoiceTallyItem(
  content: unknown,
): ChoiceTallyItemContent | null {
  const parsed = ChoiceTallyItemContentSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

/** Index of the picked option — 0..options.length-1, checked by the scorer. */
export const ChoiceTallyResponseSchema = z.object({
  chosen: z.number().int().min(0).max(7),
});

export type ChoiceTallyResponse = z.infer<typeof ChoiceTallyResponseSchema>;

/**
 * Optional settings a choice tally can carry in `Test.scoringConfig`. Strict,
 * because the config is seed-owned: a misspelled key would otherwise be
 * dropped and the tie-break would silently fall back to item order.
 */
export const ChoiceTallyConfigSchema = z.strictObject({
  /** Scale that wins when no scale is strictly ahead of the others. */
  tieBreak: z.string().trim().toUpperCase().min(1).max(4).optional(),
});

export type ChoiceTallyConfig = z.infer<typeof ChoiceTallyConfigSchema>;

/**
 * Scales in the order they first appear in the item list. That order is the
 * last-resort tie-break, so it must stay stable across scoring runs.
 */
export function choiceTallyScales(items: { content: unknown }[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const parsed = parseChoiceTallyItem(item.content);
    if (!parsed) continue;
    for (const scale of parsed.mapping) seen.add(scale);
  }
  return [...seen];
}

/**
 * Every pattern code this item set can produce: any scale can end up on top.
 * Publish uses it to demand one interpretation per scale.
 */
export function choiceTallyPatternCodes(
  items: { content: unknown }[],
): string[] {
  return choiceTallyScales(items);
}
