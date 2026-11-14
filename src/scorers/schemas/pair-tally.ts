import { z } from 'zod';
import { PairItemContentSchema } from './forced-choice-pair';

/**
 * The pair item shape is shared with `FORCED_CHOICE_PAIR`: two statements and
 * the scale each one scores. Only the scoring differs — here every pick adds a
 * point to its own scale instead of choosing one pole of a dichotomy.
 */
export {
  PairItemContentSchema,
  PairResponseSchema,
} from './forced-choice-pair';

/** One scale per statement, in the order they first appear in the item list. */
export function pairTallyScales(items: { content: unknown }[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const parsed = PairItemContentSchema.safeParse(item.content);
    if (!parsed.success) continue;
    for (const scale of parsed.data.mapping) seen.add(scale);
  }
  return [...seen];
}

/**
 * Every pattern code this item set can produce: any scale can end up on top.
 * Publish uses it to demand one interpretation per scale.
 */
export function pairTallyPatternCodes(
  items: {
    content: unknown;
  }[],
): string[] {
  return pairTallyScales(items);
}

/** Optional settings a tally test can carry in `Test.scoringConfig`. */
export const PairTallyConfigSchema = z.object({
  /** Scale that wins when no scale is strictly ahead of the others. */
  tieBreak: z.string().trim().toUpperCase().min(1).max(3).optional(),
  /** Score bands, checked in order: the first row whose `max` covers the score. */
  bands: z
    .array(
      z.object({
        max: z.number().int().min(0),
        label: z.string().trim().min(1).max(40),
      }),
    )
    .optional(),
  /** Named roll-ups of several scales (PAPI prints one per need group). */
  groups: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        scales: z.array(z.string().trim().toUpperCase().min(1).max(3)).min(1),
      }),
    )
    .optional(),
});

export type PairTallyConfig = z.infer<typeof PairTallyConfigSchema>;

export function parsePairTallyConfig(config: unknown): PairTallyConfig {
  const parsed = PairTallyConfigSchema.safeParse(config ?? {});
  return parsed.success ? parsed.data : {};
}
