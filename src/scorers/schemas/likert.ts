import { z } from 'zod';

/**
 * One scale of a Likert inventory. Uppercased on parse so the seed, the builder
 * and the scorer never disagree about casing — Big Five uses single letters
 * (E/A/C/N/O), a later inventory may use a longer code.
 */
const ScaleSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(12)
  .regex(/^[A-Z]+$/, 'scale must be A-Z');

/**
 * A statement the participant rates on a numeric scale. `scale` is the hidden
 * key: it says which scale the rating feeds. `reverse` flips the rating before
 * it is added (`min + max - rating`), which is how the BFI-44 balances its
 * positively and negatively worded items.
 */
export const LikertItemContentSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  scale: ScaleSchema,
  reverse: z.boolean().optional(),
});

export type LikertItemContent = z.infer<typeof LikertItemContentSchema>;

export function parseLikertItem(content: unknown): LikertItemContent | null {
  const parsed = LikertItemContentSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

/**
 * The rating is bounded by `scoringConfig.ratingRange` at scoring time, not
 * here: the same family serves 1–5, 1–7 and 0–3 inventories, so the schema only
 * rejects values no rating scale would use.
 */
export const LikertResponseSchema = z.object({
  rating: z.number().int().min(0).max(10),
});

export type LikertResponse = z.infer<typeof LikertResponseSchema>;

/** Optional settings a Likert test can carry in `Test.scoringConfig`. */
export const LikertConfigSchema = z.object({
  /** Defaults to 1–5. */
  ratingRange: z
    .object({
      min: z.number().int().min(0).max(10),
      max: z.number().int().min(0).max(10),
    })
    .refine((range) => range.max > range.min, 'max must be greater than min')
    .optional(),
  /**
   * Score bands, checked against the **percent** of the scale maximum: the
   * first row whose `max` covers it wins, the last row is the catch-all.
   */
  bands: z
    .array(
      z.object({
        max: z.number().min(0).max(100),
        label: z.string().trim().min(1).max(40),
      }),
    )
    .optional(),
});

export type LikertConfig = z.infer<typeof LikertConfigSchema>;

export const DEFAULT_RATING_RANGE = { min: 1, max: 5 } as const;

export function parseLikertConfig(config: unknown): LikertConfig {
  const parsed = LikertConfigSchema.safeParse(config ?? {});
  return parsed.success ? parsed.data : {};
}

/**
 * A band label becomes part of the pattern code ("Rendah" -> "RENDAH"), so it
 * is normalized the same way every time: uppercase, runs of non-alphanumerics
 * collapsed to one underscore.
 */
export function bandCode(label: string): string {
  return label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Scales in the order they first appear in the item list (the tie-breaker). */
export function likertScales(items: { content: unknown }[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const parsed = parseLikertItem(item.content);
    if (parsed) seen.add(parsed.scale);
  }
  return [...seen];
}

/**
 * Every pattern code this item set can produce. With bands, each scale can land
 * in any band (`E_RENDAH` … `E_TINGGI`); without them the scale itself is the
 * code. Publish uses it to demand one interpretation per code.
 */
export function likertPatternCodes(
  items: { content: unknown }[],
  scoringConfig?: unknown,
): string[] {
  const scales = likertScales(items);
  const bands = parseLikertConfig(scoringConfig).bands;
  if (!bands?.length) return scales;

  const codes: string[] = [];
  for (const scale of scales) {
    for (const band of bands) codes.push(`${scale}_${bandCode(band.label)}`);
  }
  return codes;
}
