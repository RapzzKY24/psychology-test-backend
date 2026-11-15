import { z } from 'zod';

/**
 * One scale of the grid. MSDT uses A-H (one letter per management style); a
 * later instrument may use short codes. Uppercased on parse so the seed, the
 * builder and the scorer never disagree about casing.
 */
const ScaleCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(3)
  .regex(/^[A-Z]+$/, 'scale must be A-Z');

const DimensionCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(6)
  .regex(/^[A-Z]+$/, 'dimension must be A-Z');

/**
 * Two statements, one answer. `mapping` is the hidden key that says which scale
 * each statement scores.
 *
 * Unlike `FORCED_CHOICE_PAIR`, the two statements may score the **same** scale:
 * MSDT's diagonal items (1, 10, 19, …) pair two statements of one style, so the
 * pick cannot change that style's score — the item exists to keep every scale's
 * ceiling equal.
 */
export const StyleGridItemContentSchema = z
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

export type StyleGridItemContent = z.infer<typeof StyleGridItemContentSchema>;

export function parseStyleGridItem(
  content: unknown,
): StyleGridItemContent | null {
  const parsed = StyleGridItemContentSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

/** Index of the statement the participant picked. */
export const StyleGridResponseSchema = z.object({
  chosen: z.number().int().min(0).max(1),
});

export type StyleGridResponse = z.infer<typeof StyleGridResponseSchema>;

/**
 * One row of the raw -> level table. `max: null` means "no upper bound" and
 * must be the last row — the source workbook's final `IF` branch.
 */
const LevelSchema = z.object({
  max: z.number().int().nullable(),
  value: z.number().min(0),
});

/**
 * Settings a grid test carries in `Test.scoringConfig`. Strict: the config is
 * seed-owned, so an unknown key means a typo, not an extension.
 */
export const StyleGridConfigSchema = z
  .strictObject({
    /** Every scale of the grid, in the order the result page prints them. */
    scales: z
      .array(
        z.object({
          code: ScaleCodeSchema,
          label: z.string().trim().min(1).max(60).optional(),
          /** Constant added after tallying (MSDT's `KOREKSI` row). */
          correction: z.number().int().default(0),
        }),
      )
      .min(2),
    /** Roll-ups: a dimension is the sum of the scales listed here. */
    dimensions: z
      .array(
        z.object({
          code: DimensionCodeSchema,
          label: z.string().trim().min(1).max(60).optional(),
          scales: z.array(ScaleCodeSchema).min(1),
        }),
      )
      .min(1),
    /** Step table, checked in order: the first row whose `max` covers the score. */
    levels: z.array(LevelSchema).min(1),
    /** A dimension counts as high when its level is strictly above this. */
    cut: z.number().min(0),
    /**
     * The style of every level pattern. A dimension named in neither list does
     * not take part in the pattern — MSDT's `O` scale is printed but does not
     * choose the style. Every profile must name the same dimensions, and the
     * set must cover all of their combinations, so one profile always matches.
     */
    profiles: z
      .array(
        z.object({
          code: z.string().trim().toUpperCase().min(1).max(10),
          label: z.string().trim().min(1).max(60),
          high: z.array(DimensionCodeSchema),
          low: z.array(DimensionCodeSchema),
        }),
      )
      .min(1),
  })
  .superRefine((config, ctx) => {
    const scaleCodes = config.scales.map((scale) => scale.code);
    if (new Set(scaleCodes).size !== scaleCodes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'scale codes must be unique',
        path: ['scales'],
      });
    }

    const dimensionCodes = config.dimensions.map((dimension) => dimension.code);
    if (new Set(dimensionCodes).size !== dimensionCodes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dimension codes must be unique',
        path: ['dimensions'],
      });
    }

    config.dimensions.forEach((dimension, index) => {
      for (const scale of dimension.scales) {
        if (!scaleCodes.includes(scale)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `unknown scale ${scale}`,
            path: ['dimensions', index, 'scales'],
          });
        }
      }
    });

    // The table is read top-down, so an out-of-order row would silently shadow
    // the rows below it.
    let seenOpenEnded = false;
    config.levels.forEach((level, index) => {
      if (level.max === null) {
        seenOpenEnded = true;
        if (index !== config.levels.length - 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'an open-ended row must be the last one',
            path: ['levels', index],
          });
        }
        return;
      }
      if (seenOpenEnded) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'no row may follow an open-ended row',
          path: ['levels', index],
        });
      }
      const previous = config.levels[index - 1];
      if (previous && previous.max !== null && level.max <= previous.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'rows must be ordered by max',
          path: ['levels', index],
        });
      }
    });

    const profileCodes = config.profiles.map((profile) => profile.code);
    if (new Set(profileCodes).size !== profileCodes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'profile codes must be unique',
        path: ['profiles'],
      });
    }

    const firstNamed = config.profiles[0]
      ? [...config.profiles[0].high, ...config.profiles[0].low].sort()
      : [];
    const patterns = new Set<string>();
    config.profiles.forEach((profile, index) => {
      const named = [...profile.high, ...profile.low];
      const unique = new Set(named);
      if (unique.size !== named.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'a dimension may appear once per profile',
          path: ['profiles', index],
        });
      }
      for (const code of named) {
        if (!dimensionCodes.includes(code)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `unknown dimension ${code}`,
            path: ['profiles', index],
          });
        }
      }
      if ([...unique].sort().join(',') !== firstNamed.join(',')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'every profile must name the same dimensions',
          path: ['profiles', index],
        });
      }
      patterns.add(profile.high.slice().sort().join(','));
    });

    // Every combination of the named dimensions needs its own profile, or a
    // participant can land on a pattern no interpretation covers.
    if (patterns.size !== 2 ** firstNamed.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'profiles must cover every combination of the named dimensions',
        path: ['profiles'],
      });
    }
  });

export type StyleGridConfig = z.infer<typeof StyleGridConfigSchema>;

export function parseStyleGridConfig(config: unknown): StyleGridConfig | null {
  const parsed = StyleGridConfigSchema.safeParse(config);
  return parsed.success ? parsed.data : null;
}

/** Every pattern code this test can produce: one per declared profile. */
export function styleGridPatternCodes(scoringConfig?: unknown): string[] {
  const config = parseStyleGridConfig(scoringConfig);
  return config ? config.profiles.map((profile) => profile.code) : [];
}
