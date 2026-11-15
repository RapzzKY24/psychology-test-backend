import { z } from 'zod';

/**
 * One scale of a Likert inventory. Uppercased on parse so the seed, the builder
 * and the scorer never disagree about casing — Big Five uses single letters
 * (E/A/C/N/O), Enneagram numbers its types (T1..T9), a later inventory may use
 * a longer code. A code starts with a letter so it can never read as a number.
 */
export const ScaleSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(12)
  .regex(/^[A-Z][A-Z0-9]*$/, 'scale must start with a letter');

/**
 * A part of a multi-section inventory. MSAI asks the same twelve roles three
 * ways (behaviour, effectiveness, importance) and only one of them decides the
 * profile, so the items have to say which part they belong to.
 */
const SectionSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(20)
  .regex(/^[A-Z][A-Z0-9]*$/, 'section must start with a letter');

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
  /** Optional part of a multi-section inventory; see `SectionSchema`. */
  section: SectionSchema.optional(),
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

/**
 * Optional settings a Likert test can carry in `Test.scoringConfig`. Strict:
 * the config is seed-owned, so an unknown key means a typo, not an extension.
 */
export const LikertConfigSchema = z
  .strictObject({
    /** Defaults to 1–5. */
    ratingRange: z
      .object({
        min: z.number().int().min(0).max(10),
        max: z.number().int().min(0).max(10),
      })
      .refine((range) => range.max > range.min, 'max must be greater than min')
      .optional(),
    /**
     * What each point of the scale means, lowest first. Only the source
     * instrument knows this — Enneagram's 0–3 is "tidak sama sekali … sangat
     * baik", and a bare number would leave the participant guessing.
     */
    ratingLabels: z
      .array(z.string().trim().min(1).max(60))
      .min(2)
      .max(11)
      .optional(),
    /**
     * Per-section wording of the rating points, when the sections use different
     * anchors (MSAI: "Strongly Agree" vs "Outstanding" vs "Critically
     * Important"). `ratingLabels` stays the fallback for items without a
     * section.
     */
    sectionLabels: z
      .record(
        z.string().trim().toUpperCase(),
        z.array(z.string().trim().min(1).max(60)).min(2).max(11),
      )
      .optional(),
    /**
     * Section whose scales become the result (`scores.scales`, `type`,
     * `patternCode`). Defaults to the first section in item order.
     */
    patternSection: SectionSchema.optional(),
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
  })
  .superRefine((config, ctx) => {
    const range = config.ratingRange ?? DEFAULT_RATING_RANGE;
    const expected = range.max - range.min + 1;
    if (config.ratingLabels && config.ratingLabels.length !== expected) {
      ctx.addIssue({
        code: 'custom',
        path: ['ratingLabels'],
        message: `must have ${expected} labels for a ${range.min}-${range.max} scale`,
      });
    }
    for (const [section, labels] of Object.entries(
      config.sectionLabels ?? {},
    )) {
      if (labels.length !== expected) {
        ctx.addIssue({
          code: 'custom',
          path: ['sectionLabels', section],
          message: `must have ${expected} labels for a ${range.min}-${range.max} scale`,
        });
      }
    }
  });

export type LikertConfig = z.infer<typeof LikertConfigSchema>;

export const DEFAULT_RATING_RANGE = { min: 1, max: 5 } as const;

/**
 * The response shape for **one** test: the rating is bounded by that test's
 * own `ratingRange`, so 6 on a 1–5 inventory is a 422 when it is written
 * instead of an answer the scorer silently drops.
 *
 * The family-wide `LikertResponseSchema` stays the fallback for a caller that
 * has no config (and for tests that predate the column).
 */
export function likertResponseSchema(scoringConfig?: unknown): z.ZodSchema {
  const range =
    parseLikertConfig(scoringConfig).ratingRange ?? DEFAULT_RATING_RANGE;
  return z.object({
    rating: z
      .number()
      .int()
      .min(range.min, {
        message: `rating must be at least ${range.min}`,
      })
      .max(range.max, {
        message: `rating must be at most ${range.max}`,
      }),
  });
}

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
export function likertScales(
  items: { content: unknown }[],
  section?: string,
): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const parsed = parseLikertItem(item.content);
    if (!parsed) continue;
    if (section !== undefined && parsed.section !== section) continue;
    seen.add(parsed.scale);
  }
  return [...seen];
}

/** Sections in the order they first appear; empty when the test has none. */
export function likertSections(items: { content: unknown }[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const parsed = parseLikertItem(item.content);
    if (parsed?.section) seen.add(parsed.section);
  }
  return [...seen];
}

/**
 * The section whose scales are the result: `scoringConfig.patternSection` when
 * it names a section the items actually use, otherwise the first one.
 */
export function likertPatternSection(
  items: { content: unknown }[],
  scoringConfig?: unknown,
): string | undefined {
  const sections = likertSections(items);
  if (sections.length === 0) return undefined;
  const wanted = parseLikertConfig(scoringConfig).patternSection;
  return wanted && sections.includes(wanted) ? wanted : sections[0];
}

/**
 * Every pattern code this item set can produce. With bands, each scale can land
 * in any band (`E_RENDAH` … `E_TINGGI`); without them the scale itself is the
 * code. Publish uses it to demand one interpretation per code.
 *
 * Only the pattern section counts: MSAI's effectiveness and importance scales
 * share the role names, so including them would ask for the same 12 codes three
 * times over.
 */
export function likertPatternCodes(
  items: { content: unknown }[],
  scoringConfig?: unknown,
): string[] {
  const scales = likertScales(
    items,
    likertPatternSection(items, scoringConfig),
  );
  const bands = parseLikertConfig(scoringConfig).bands;
  if (!bands?.length) return scales;

  const codes: string[] = [];
  for (const scale of scales) {
    for (const band of bands) codes.push(`${scale}_${bandCode(band.label)}`);
  }
  return codes;
}
