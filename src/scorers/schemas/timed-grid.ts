import { z } from 'zod';

/** A lajur's digits. The answer for gap `i` is `(digits[i] + digits[i + 1]) % 10`. */
export const TimedGridItemContentSchema = z.object({
  /** 1-based lajur number, printed on the sheet. */
  column: z.number().int().min(1).max(200),
  digits: z.array(z.number().int().min(0).max(9)).min(2).max(60),
});

export type TimedGridItemContent = z.infer<typeof TimedGridItemContentSchema>;

export function parseTimedGridItem(
  content: unknown,
): TimedGridItemContent | null {
  const parsed = TimedGridItemContentSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

/** The key for one lajur: one expected digit per gap. Never sent to the client. */
export function timedGridKey(digits: number[]): number[] {
  return digits
    .slice(0, -1)
    .map((digit, index) => (digit + digits[index + 1]) % 10);
}

/**
 * One cell per gap. `null` is a gap the participant never reached — the
 * workbook calls it a `lubang` and counts it apart from a wrong answer.
 */
export const TimedGridResponseSchema = z.object({
  answers: z.array(z.number().int().min(0).max(9).nullable()),
});

export type TimedGridResponse = z.infer<typeof TimedGridResponseSchema>;

/**
 * The family-wide shape is open-ended; each lajur closes it to its own length.
 * Without this a participant could store 40 answers against a 26-gap lajur and
 * the extra digits would be silently dropped.
 */
export function timedGridResponseSchema(itemContent?: unknown): z.ZodSchema {
  const item = parseTimedGridItem(itemContent);
  if (!item) return TimedGridResponseSchema;
  return z.object({
    answers: z
      .array(z.number().int().min(0).max(9).nullable())
      .length(item.digits.length - 1),
  });
}

/** The factor the scorer derives from the work curve. */
export const TimedGridFormulaSchema = z.enum([
  /** Mean correct answers per lajur — the workbook's `Panker`. */
  'MEAN_CORRECT',
  /** Mean absolute deviation of the per-lajur scores — `Janker`. */
  'MEAN_DEVIATION',
  /** Least-squares slope times the lajur count — `Hanker`, `y(n) - y(0)`. */
  'SLOPE',
  /** Errors plus skipped, both counted per gap — `Tianker`. */
  'ERRORS',
]);

/**
 * One row of a norm table, kept as the workbook's `Select Case`: `lte` rows are
 * read top-down and the first match wins, `gte` rows likewise, and `else` is
 * the fallback. Porting the comparison rather than a threshold keeps a table
 * with a negative first row readable against the source.
 */
const BandSchema = z.object({
  op: z.enum(['lte', 'gte', 'else']),
  value: z.number().nullable(),
  label: z.string().trim().min(1).max(40),
});

const FactorSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(2)
      .max(6)
      .regex(/^[A-Z]+$/, 'factor code must be A-Z'),
    label: z.string().trim().min(1).max(60),
    formula: TimedGridFormulaSchema,
    /** Decimals kept before the band lookup; the workbook rounds first. */
    decimals: z.number().int().min(0).max(4).default(2),
    /** Group code read when the attempt's education has no mapping. */
    defaultGroup: z.string().trim().min(1).max(10),
    /** Norm group code -> its band rows. */
    groups: z.record(
      z.string().trim().min(1).max(10),
      z.array(BandSchema).min(1),
    ),
  })
  .superRefine((factor, ctx) => {
    for (const [group, bands] of Object.entries(factor.groups)) {
      let direction: 'lte' | 'gte' | null = null;
      bands.forEach((band, index) => {
        if (band.op === 'else') {
          if (index !== bands.length - 1) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'an else row must be the last one',
              path: ['groups', group, index],
            });
          }
          if (band.value !== null) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'an else row carries no value',
              path: ['groups', group, index],
            });
          }
          return;
        }
        if (band.value === null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'a bound row needs a value',
            path: ['groups', group, index],
          });
          return;
        }
        direction ??= band.op;
        if (band.op !== direction) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'every bound row in a group must compare the same way',
            path: ['groups', group, index],
          });
        }
        const previous = bands[index - 1];
        if (previous && previous.op === band.op && previous.value !== null) {
          const ordered =
            band.op === 'lte'
              ? band.value > previous.value
              : band.value < previous.value;
          if (!ordered) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'rows must be ordered by their bound',
              path: ['groups', group, index],
            });
          }
        }
      });
    }

    if (!factor.groups[factor.defaultGroup]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'defaultGroup must name one of the groups',
        path: ['defaultGroup'],
      });
    }
  });

/**
 * Settings a timed grid carries in `Test.scoringConfig`. Strict: the config is
 * seed-owned, so an unknown key is a typo, not an extension.
 */
export const TimedGridConfigSchema = z
  .strictObject({
    /**
     * Which norm group a declared education reads. A group missing here falls
     * back to the factor's `defaultGroup`, which is how the workbook's `Case
     * Else` table is reached.
     */
    educationGroups: z
      .record(
        z.string().trim().min(1).max(40),
        z.string().trim().min(1).max(10),
      )
      .default({}),
    factors: z.array(FactorSchema).min(1),
  })
  .superRefine((config, ctx) => {
    const codes = config.factors.map((factor) => factor.code);
    if (new Set(codes).size !== codes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'factor codes must be unique',
        path: ['factors'],
      });
    }
  });

export type TimedGridConfig = z.infer<typeof TimedGridConfigSchema>;
export type TimedGridFactor = TimedGridConfig['factors'][number];
export type TimedGridBand = z.infer<typeof BandSchema>;

export function parseTimedGridConfig(config: unknown): TimedGridConfig | null {
  const parsed = TimedGridConfigSchema.safeParse(config);
  return parsed.success ? parsed.data : null;
}

/**
 * The band a factor value lands in. Rows are read in order and the first match
 * wins, exactly like the workbook's nested `Select Case`.
 */
export function bandFor(bands: TimedGridBand[], value: number): string | null {
  for (const band of bands) {
    if (band.op === 'else') return band.label;
    if (band.value === null) continue;
    if (band.op === 'lte' && value <= band.value) return band.label;
    if (band.op === 'gte' && value >= band.value) return band.label;
  }
  return null;
}

/**
 * No pattern codes: the work curve is a score profile, not a typology, so
 * publish must not demand an interpretation for a code that never occurs.
 */
export function timedGridPatternCodes(): string[] {
  return [];
}
