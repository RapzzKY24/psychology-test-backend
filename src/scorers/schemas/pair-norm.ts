import { z } from 'zod';

/**
 * One need / field of the instrument. EPPS uses three-letter codes (ACH, DEF);
 * a later instrument may use shorter ones. Uppercased on parse so the seed, the
 * builder and the scorer never disagree about casing.
 */
const ScaleCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(4)
  .regex(/^[A-Z]+$/, 'scale must be A-Z');

/**
 * Two statements, one answer. `mapping` is the hidden key that says which scale
 * each statement scores.
 *
 * Unlike `FORCED_CHOICE_PAIR`, the two statements may score the **same** scale.
 * EPPS has 15 such items (one per need, on the diagonal of its answer grid):
 * the pick cannot separate the two statements, so the scorer drops the item
 * instead of letting it add a point to that need either way. Keeping the item
 * in the list preserves the printed 225 and its consistency check.
 */
export const PairNormItemContentSchema = z
  .object({
    question: z.string().trim().min(1).max(2000).optional(),
    statements: z.array(z.string().trim().min(1).max(500)).length(2),
    mapping: z.array(ScaleCodeSchema).length(2),
  })
  .superRefine((data, ctx) => {
    if (
      data.statements[0].trim().toLowerCase() ===
      data.statements[1].trim().toLowerCase()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'the two statements must differ',
        path: ['statements'],
      });
    }
  });

export type PairNormItemContent = z.infer<typeof PairNormItemContentSchema>;

export function parsePairNormItem(
  content: unknown,
): PairNormItemContent | null {
  const parsed = PairNormItemContentSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

/** Index of the statement the participant picked. */
export const PairNormResponseSchema = z.object({
  chosen: z.number().int().min(0).max(1),
});

export type PairNormResponse = z.infer<typeof PairNormResponseSchema>;

const ScaleSchema = z.object({
  code: ScaleCodeSchema,
  label: z.string().trim().min(1).max(80).optional(),
});

/**
 * Percentile of each raw score, index = raw. EPPS ships 29 rows (0–28) per
 * need, so a row is an array rather than an object keyed by score.
 *
 * The upper bound is deliberately loose: the source workbook carries a few
 * transcription typos (one cell reads 544), and the seed copies the workbook
 * rather than silently repairing it. `percentileOf` clamps when it reads.
 */
const PercentileColumnSchema = z.array(z.number().int().min(0)).min(2);

/** One norm table per sex; the attempt's `gender` picks which one. */
const SexTableSchema = z.record(ScaleCodeSchema, PercentileColumnSchema);

/**
 * `{ MALE: {...}, FEMALE: {...} }` — a set may ship only one of the two, so
 * this is a partial record rather than an exhaustive one.
 */
const NormSetSchema = z.partialRecord(
  z.enum(['MALE', 'FEMALE']),
  SexTableSchema,
);

/**
 * A band over the percentile (EPPS: ≤3 sangat rendah … >96 sangat tinggi), or
 * over the consistency count when the object is `consistency.bands`.
 */
const BandSchema = z.object({
  max: z.number().int().nullable(),
  label: z.string().trim().min(1).max(40),
});

/**
 * EPPS scores a pair by adding one point to the picked statement's need, reads
 * that raw score against a percentile table, and checks 15 repeated items for
 * consistency. Everything the items do not carry lives here.
 *
 * Strict: the config is seed-owned, so an unknown key means a typo.
 */
export const PairNormConfigSchema = z
  .strictObject({
    /** Every scale the item list may score, in printed order. */
    scales: z.array(ScaleSchema).min(2),
    /**
     * Which table set to read. EPPS ships `college` and `general`; the test
     * carries one set per audience and `normSet` names the one it uses.
     */
    normSet: z.string().trim().min(1).max(40).optional(),
    /** `{ <set>: { MALE: {...}, FEMALE: {...} } }`; a set may ship one sex. */
    norms: z.record(z.string().trim().min(1).max(40), NormSetSchema).optional(),
    /** Percentile bands, checked in order: the first row whose `max` covers it. */
    categories: z.array(BandSchema).min(1).optional(),
    /**
     * Repeated items. `pairs` holds `[order, order]` — the printed item
     * numbers — and the score counts how many pairs answered the same way.
     */
    consistency: z
      .object({
        pairs: z
          .array(z.tuple([z.number().int().min(1), z.number().int().min(1)]))
          .min(1),
        bands: z.array(BandSchema).min(1),
      })
      .optional(),
    /** Scale that wins when two needs share the top percentile. */
    tieBreak: ScaleCodeSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (const [index, scale] of data.scales.entries()) {
      if (seen.has(scale.code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate scale code ${scale.code}`,
          path: ['scales', index, 'code'],
        });
      }
      seen.add(scale.code);
    }

    if (data.normSet && !data.norms?.[data.normSet]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `normSet ${data.normSet} has no table in norms`,
        path: ['normSet'],
      });
    }

    for (const [set, table] of Object.entries(data.norms ?? {})) {
      for (const [sex, columns] of Object.entries(table)) {
        for (const scale of data.scales) {
          if (!columns[scale.code]) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `norms.${set}.${sex} is missing a column for ${scale.code}`,
              path: ['norms', set, sex, scale.code],
            });
          }
        }
        // The raw range is the instrument's own (EPPS: 0–28), so the length is
        // not fixed here — but every column must agree, or a short one would
        // shift that need's percentile against the rest.
        const lengths = new Set<number>();
        for (const [code, column] of Object.entries(columns)) {
          if (!seen.has(code)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `norms.${set}.${sex} has a column for undeclared scale ${code}`,
              path: ['norms', set, sex, code],
            });
          }
          lengths.add(column.length);
        }
        if (lengths.size > 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `norms.${set}.${sex} columns must all hold one row per raw score`,
            path: ['norms', set, sex],
          });
        }
      }
    }

    if (data.categories) {
      const open = data.categories.filter((band) => band.max === null);
      if (open.length !== 1 || data.categories.at(-1)?.max !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'the last band must have max: null and be the only open band',
          path: ['categories'],
        });
      }
      for (let index = 1; index < data.categories.length; index += 1) {
        const previous = data.categories[index - 1].max;
        const current = data.categories[index].max;
        if (previous !== null && current !== null && current <= previous) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'bands must be listed in ascending order',
            path: ['categories', index, 'max'],
          });
        }
      }
    }

    if (data.consistency) {
      const used = new Set<number>();
      for (const [index, [a, b]] of data.consistency.pairs.entries()) {
        if (a === b) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'a consistency pair needs two different items',
            path: ['consistency', 'pairs', index],
          });
        }
        for (const order of [a, b]) {
          if (used.has(order)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `item ${order} appears in more than one consistency pair`,
              path: ['consistency', 'pairs', index],
            });
          }
          used.add(order);
        }
      }
    }
  });

export type PairNormConfig = z.infer<typeof PairNormConfigSchema>;

export function parsePairNormConfig(config: unknown): PairNormConfig | null {
  const parsed = PairNormConfigSchema.safeParse(config ?? {});
  return parsed.success ? parsed.data : null;
}

/** Scales in printed order: the config's list, else the first item appearance. */
export function pairNormScales(
  items: { content: unknown }[],
  config?: PairNormConfig | null,
): string[] {
  if (config?.scales.length) return config.scales.map((scale) => scale.code);

  const seen = new Set<string>();
  for (const item of items) {
    const parsed = parsePairNormItem(item.content);
    if (!parsed) continue;
    for (const scale of parsed.mapping) seen.add(scale);
  }
  return [...seen];
}

/**
 * Every pattern code this instrument can produce: the need whose percentile is
 * highest. Publish uses it to demand one interpretation per need.
 */
export function pairNormPatternCodes(scoringConfig?: unknown): string[] {
  const config = parsePairNormConfig(scoringConfig);
  return config ? config.scales.map((scale) => scale.code) : [];
}
