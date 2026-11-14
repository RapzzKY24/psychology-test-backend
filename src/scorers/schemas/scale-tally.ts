import { z } from 'zod';

/**
 * One scale of a tally instrument. Uppercased on parse so the seed, the
 * builder and the scorer never disagree about casing — RIASEC uses single
 * letters (R/I/A/S/E/C), a later inventory may use short codes.
 */
const ScaleSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(4)
  .regex(/^[A-Z]+$/, 'scale must be A-Z');

/**
 * A statement the participant agrees or disagrees with. `options` is always the
 * same two labels (`["Ya","Tidak"]`), but it is stored per item so the runner
 * renders it like any other two-option item. `scale` is the hidden key: it says
 * which scale a "Ya" adds a point to.
 */
export const ScaleTallyItemContentSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  options: z.array(z.string().trim().min(1).max(200)).length(2),
  scale: ScaleSchema,
});

export type ScaleTallyItemContent = z.infer<typeof ScaleTallyItemContentSchema>;

export function parseScaleTallyItem(
  content: unknown,
): ScaleTallyItemContent | null {
  const parsed = ScaleTallyItemContentSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

/** Index of the picked option: 0 agrees, 1 disagrees. */
export const ScaleTallyResponseSchema = z.object({
  chosen: z.number().int().min(0).max(1),
});

export type ScaleTallyResponse = z.infer<typeof ScaleTallyResponseSchema>;

/**
 * Scales in the order they first appear in the item list. That order is the
 * tie-breaker when two scales end on the same score, so it must stay stable
 * across scoring runs — it is the item order, not a hand-written list.
 */
export function scaleTallyScales(items: { content: unknown }[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const parsed = parseScaleTallyItem(item.content);
    if (parsed) seen.add(parsed.scale);
  }
  return [...seen];
}

/**
 * Every pattern code this item set can produce: the scale that ends up on top.
 * Publish uses it to demand one interpretation per scale.
 */
export function scaleTallyPatternCodes(
  items: { content: unknown }[],
): string[] {
  return scaleTallyScales(items);
}
