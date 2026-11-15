import { z } from 'zod';

/**
 * One interest field. Uppercased on parse so the seed, the builder and the
 * scorer never disagree about casing — Kuder uses the workbook's short codes
 * (OUT, ME, COMP, …) and one of them, `S.S`, keeps the dot.
 */
const ScaleSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(6)
  .regex(/^[A-Z][A-Z.]*$/, 'scale must start with a letter');

/** Kuder prints 42 activities per list; nothing in the source is wider. */
export const MAX_MARK_OPTIONS = 42;

/**
 * A list of activities the participant marks one by one: `+` when they like
 * it, `-` when they do not, blank when they have no opinion.
 *
 * `mapping` lines up with `options` and lists every field an activity scores —
 * Kuder loads one activity on two or three fields, so a single mark can move
 * several tallies at once. `verification` names the positions the validity
 * scale counts; it is part of the key, never sent to the participant.
 */
export const MarkGroupItemContentSchema = z
  .object({
    question: z.string().trim().min(1).max(2000).optional(),
    options: z
      .array(z.string().trim().min(1).max(200))
      .min(2)
      .max(MAX_MARK_OPTIONS),
    mapping: z
      // An empty list is legal: Kuder has activities that only feed the
      // validity scale and belong to no interest field.
      .array(z.array(ScaleSchema).max(6))
      .min(2)
      .max(MAX_MARK_OPTIONS),
    verification: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(MAX_MARK_OPTIONS - 1),
      )
      .max(MAX_MARK_OPTIONS)
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mapping.length !== data.options.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'mapping must list the fields of every option',
        path: ['mapping'],
      });
    }
    if (data.verification) {
      const outOfRange = data.verification.some(
        (index) => index >= data.options.length,
      );
      if (outOfRange) {
        ctx.addIssue({
          code: 'custom',
          message: 'verification must only name existing options',
          path: ['verification'],
        });
      }
      if (new Set(data.verification).size !== data.verification.length) {
        ctx.addIssue({
          code: 'custom',
          message: 'verification must not repeat an option',
          path: ['verification'],
        });
      }
    }
  });

export type MarkGroupItemContent = z.infer<typeof MarkGroupItemContentSchema>;

export function parseMarkGroupItem(
  content: unknown,
): MarkGroupItemContent | null {
  const parsed = MarkGroupItemContentSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

/**
 * The marks on one list. The family-wide shape only bounds the numbers; the
 * per-item schema built by `markGroupResponseSchema` adds the option count and
 * the "one activity cannot be both liked and disliked" rule.
 */
export const MarkGroupResponseSchema = z.object({
  liked: z.array(z.number().int().min(0)).max(MAX_MARK_OPTIONS),
  disliked: z.array(z.number().int().min(0)).max(MAX_MARK_OPTIONS),
});

export type MarkGroupResponse = z.infer<typeof MarkGroupResponseSchema>;

/**
 * The answer shape for **one** list: indexes inside that list, no repeats, and
 * no activity on both sides. A mark outside the list would otherwise be
 * dropped by the scorer while the participant saw an answer that counted.
 */
export function markGroupResponseSchema(itemContent?: unknown): z.ZodSchema {
  const item = parseMarkGroupItem(itemContent);
  const count = item ? item.options.length : MAX_MARK_OPTIONS;
  const index = z
    .number()
    .int()
    .min(0)
    .max(count - 1);
  return z
    .object({
      liked: z.array(index).max(count),
      disliked: z.array(index).max(count),
    })
    .superRefine((value, ctx) => {
      const all = [...value.liked, ...value.disliked];
      if (new Set(all).size !== all.length) {
        ctx.addIssue({
          code: 'custom',
          message: 'an activity can be liked or disliked, not both',
          path: ['liked'],
        });
      }
    });
}

/** One score band, checked in order: the first row whose `max` covers the value. */
const BandSchema = z.object({
  max: z.number().int().min(0).max(100),
  label: z.string().trim().min(1).max(120),
});

/**
 * Settings a marked-list test carries in `Test.scoringConfig`. Strict: the
 * config is seed-owned, so an unknown key means a typo, not an extension.
 *
 * `norms` is the instrument's percentile table — one row per raw score, per
 * field, per sex — because Kuder scores men and women against different
 * tables. The rows are positional: `norms.MALE.OUT[7]` is the percentile of a
 * raw score of 7.
 */
const NormRowSchema = z.record(
  z.string().trim().min(1).max(6),
  z.array(z.number().min(0).max(1)).min(1),
);

export const MarkGroupConfigSchema = z.strictObject({
  norms: z
    .object({
      MALE: NormRowSchema.optional(),
      FEMALE: NormRowSchema.optional(),
    })
    .optional(),
  /** Bands over the percentile (0-100), e.g. Rendah / Cukup / Tinggi. */
  bands: z.array(BandSchema).optional(),
  /** Bands over the raw validity scale, checked the same way. */
  verificationBands: z.array(BandSchema).optional(),
});

export type MarkGroupConfig = z.infer<typeof MarkGroupConfigSchema>;

/**
 * Field codes are uppercased here so a hand-written config cannot disagree with
 * the item mapping — a lookup miss would silently leave a field without a
 * percentile.
 */
export function parseMarkGroupConfig(config: unknown): MarkGroupConfig {
  const parsed = MarkGroupConfigSchema.safeParse(config ?? {});
  if (!parsed.success) return {};
  const { norms } = parsed.data;
  if (!norms) return parsed.data;
  const upper = (table: Record<string, number[]> | undefined) =>
    Object.fromEntries(
      Object.entries(table ?? {}).map(([code, rows]) => [
        code.toUpperCase(),
        rows,
      ]),
    );
  return {
    ...parsed.data,
    norms: { MALE: upper(norms.MALE), FEMALE: upper(norms.FEMALE) },
  };
}

/** Fields in the order they first appear in the item list (the tie-breaker). */
export function markGroupScales(items: { content: unknown }[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const parsed = parseMarkGroupItem(item.content);
    if (!parsed) continue;
    for (const codes of parsed.mapping) {
      for (const code of codes) seen.add(code);
    }
  }
  return [...seen];
}

/**
 * Every pattern code this item set can produce: any field can end up the
 * strongest. Publish uses it to demand one interpretation per field.
 */
export function markGroupPatternCodes(items: { content: unknown }[]): string[] {
  return markGroupScales(items);
}
