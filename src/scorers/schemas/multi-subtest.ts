import { z } from 'zod';

/**
 * IST is nine subtests under one cover, each with its own clock and its own
 * kind of answer: five printed options, a number, a single word, or a figure.
 * The family keeps that shape instead of flattening it, because the raw score
 * of a subtest is only meaningful against that subtest's norm row.
 */
export const MULTI_SUBTEST_KINDS = [
  'CHOICE',
  'IMAGE',
  'PAIR',
  'NUMBER',
] as const;

export type MultiSubtestKind = (typeof MULTI_SUBTEST_KINDS)[number];

/** Letters the choice subtests print. */
export const MULTI_SUBTEST_LETTERS = ['a', 'b', 'c', 'd', 'e'] as const;

const Answer = z.string().trim().min(1).max(200);

/**
 * Five printed options under a sentence (SE, WA, AN) or under a figure (FA,
 * WU). The letter is the key: the answer sheet crosses one of a–e.
 */
export const MultiSubtestChoiceItemSchema = z.object({
  kind: z.literal('CHOICE'),
  prompt: z.string().trim().max(2000),
  options: z.object({
    a: z.string().trim().min(1).max(500),
    b: z.string().trim().min(1).max(500),
    c: z.string().trim().min(1).max(500),
    d: z.string().trim().min(1).max(500),
    e: z.string().trim().min(1).max(500),
  }),
  /** The letter the answer sheet crosses. `sanitize` never sends it out. */
  key: z.enum(MULTI_SUBTEST_LETTERS),
});

/**
 * The figure subtests (FA 117–136, WU 137–156) print the item and its five
 * options as one block, so the block ships as one image and the participant
 * still answers with a letter.
 */
export const MultiSubtestImageItemSchema = z.object({
  kind: z.literal('IMAGE'),
  imageUrl: z
    .string()
    .trim()
    .regex(/^\/uploads\/test-items\/[a-f0-9-]+\.(png|jpg)$/, {
      message: 'imageUrl must point at a seeded item figure',
    }),
  key: z.enum(MULTI_SUBTEST_LETTERS),
});

/**
 * GE (61–76) prints two words and asks for the concept that covers both. The
 * participant types the word; the rubric decides what it is worth.
 */
export const MultiSubtestPairItemSchema = z.object({
  kind: z.literal('PAIR'),
  words: z.tuple([
    z.string().trim().min(1).max(200),
    z.string().trim().min(1).max(200),
  ]),
});

/**
 * RA (77–96) prints a word problem, ZR (97–116) prints a number series. Both
 * are answered with a number, so the difference is only in what is printed.
 */
export const MultiSubtestNumberItemSchema = z.object({
  kind: z.literal('NUMBER'),
  prompt: z.string().trim().max(2000).optional(),
  series: z.array(z.number().int()).min(2).max(20).optional(),
  key: z.number().int().min(-1_000_000).max(1_000_000),
});

export const MultiSubtestItemContentSchema = z.union([
  MultiSubtestChoiceItemSchema,
  MultiSubtestImageItemSchema,
  MultiSubtestPairItemSchema,
  MultiSubtestNumberItemSchema,
]);

export type MultiSubtestItemContent = z.infer<
  typeof MultiSubtestItemContentSchema
>;

export function parseMultiSubtestItem(
  content: unknown,
): MultiSubtestItemContent | null {
  const parsed = MultiSubtestItemContentSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

/** One answer shape for every subtest: a letter, a number or a word. */
export const MultiSubtestResponseSchema = z.object({ answer: Answer });

export type MultiSubtestResponse = z.infer<typeof MultiSubtestResponseSchema>;

/**
 * The printed list a subtest asks the participant to study. ME is the only one
 * that has it, and it is not derivable from the items: the items name the five
 * categories, while the list holds the five members under each.
 */
export const MultiSubtestMemorizeGroupSchema = z.object({
  label: z.string().trim().min(1).max(40),
  words: z.array(z.string().trim().min(1).max(40)).min(1).max(40),
});

/** One subtest as the seed declares it. */
export const MultiSubtestSectionSchema = z.object({
  code: z.string().trim().min(2).max(4),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(MULTI_SUBTEST_KINDS),
  itemCount: z.number().int().min(1).max(200),
  /**
   * Answering window. The source packet prints no per-subtest clock, so the
   * seed carries the standard IST timings and says so in its note.
   */
  timeLimitMin: z.number().int().min(1).max(60),
  /** ME prints its word list first; the answer clock starts after this. */
  memorizeMin: z.number().int().min(0).max(30).optional(),
  /** The list itself, printed during `memorizeMin`. */
  memorizeList: z.array(MultiSubtestMemorizeGroupSchema).max(20).optional(),
  instruction: z.string().trim().min(1).max(2000),
});

export type MultiSubtestSection = z.infer<typeof MultiSubtestSectionSchema>;

/**
 * One age band of the norm. `maxMonths` is inclusive; the bands run in order
 * and the first match wins, so the seed writes them from youngest up.
 */
export const MultiSubtestAgeBandSchema = z.object({
  label: z.string().trim().min(1).max(20),
  // The oldest band is a catch-all, so its ceiling is a sentinel (200 years in
  // the seed) rather than a real age.
  maxMonths: z.number().int().min(1).max(12000),
});

/**
 * The rubric row of one GE item: what earns 2 and what earns 1. Anything else
 * earns nothing, exactly like the answer sheet's "tidak cocok".
 */
export const MultiSubtestRubricSchema = z.record(
  z.string().regex(/^\d+$/),
  z.object({
    score2: z.array(z.string().trim().min(1)).default([]),
    score1: z.array(z.string().trim().min(1)).default([]),
  }),
);

export const MultiSubtestConfigSchema = z.object({
  subtests: z.array(MultiSubtestSectionSchema).min(1).max(20),
  /** Age bands, youngest first, each with the highest age (in months) it covers. */
  ageBands: z.array(MultiSubtestAgeBandSchema).min(1).max(30),
  /**
   * `standardScores[band][code]` is the raw → standard-score row of that
   * subtest, index = raw score.
   */
  standardScores: z.record(
    z.string(),
    z.record(z.string(), z.array(z.number().int().min(0).max(400))),
  ),
  /** `iqTable[band]` is total raw → IQ, index = total raw score. */
  iqTable: z.record(z.string(), z.array(z.number().int().min(0).max(400))),
  /** GE raw (0–32) → the 1–20 value the standard table is read with. */
  geConversion: z.array(z.number().int().min(1).max(20)),
  geRubric: MultiSubtestRubricSchema,
  /** |(GE+RA) − (AN+ZR)| at or below this reads as balanced thinking. */
  dominanceBalancedWithin: z.number().int().min(0).max(100).default(10),
});

export type MultiSubtestConfig = z.infer<typeof MultiSubtestConfigSchema>;

export function parseMultiSubtestConfig(
  config: unknown,
): MultiSubtestConfig | null {
  const parsed = MultiSubtestConfigSchema.safeParse(config);
  return parsed.success ? parsed.data : null;
}

/** The subtest a printed item number belongs to, from the declared counts. */
export function subtestOfItem(
  config: MultiSubtestConfig,
  itemOrder: number,
): MultiSubtestSection | null {
  let start = 1;
  for (const section of config.subtests) {
    if (itemOrder < start + section.itemCount) return section;
    start += section.itemCount;
  }
  return null;
}

/** Where a subtest's clock starts, in minutes after the attempt began. */
export function subtestOffsetMin(
  config: MultiSubtestConfig,
  code: string,
): number | null {
  let offset = 0;
  for (const section of config.subtests) {
    if (section.code === code) return offset;
    offset += (section.memorizeMin ?? 0) + section.timeLimitMin;
  }
  return null;
}

/** Total wall clock of the whole battery, in minutes. */
export function totalMinutes(config: MultiSubtestConfig): number {
  return config.subtests.reduce(
    (sum, section) => sum + (section.memorizeMin ?? 0) + section.timeLimitMin,
    0,
  );
}

/** Age band whose row covers this age in months; the last band catches the rest. */
export function ageBandFor(
  config: MultiSubtestConfig,
  ageMonths: number,
): string | null {
  for (const band of config.ageBands) {
    if (ageMonths <= band.maxMonths) return band.label;
  }
  return config.ageBands.at(-1)?.label ?? null;
}

/** The norm row of one subtest, or null when the band has no such row. */
export function standardScoreRow(
  config: MultiSubtestConfig,
  band: string,
  code: string,
  raw: number,
): number | null {
  const row = config.standardScores[band]?.[code];
  if (!row) return null;
  return row[Math.min(Math.max(raw, 0), row.length - 1)] ?? null;
}

/** Total raw → IQ for one band. */
export function iqFor(
  config: MultiSubtestConfig,
  band: string,
  totalRaw: number,
): number | null {
  const table = config.iqTable[band];
  if (!table) return null;
  return table[Math.min(Math.max(totalRaw, 0), table.length - 1)] ?? null;
}

/**
 * The source workbook scores GE through a dropdown the examiner fills, so its
 * raw runs to 32 while every other subtest stops at 20. This is that
 * conversion, and it is also what makes the total land on the 0–180 table.
 */
export function convertGe(config: MultiSubtestConfig, raw: number): number {
  const index = Math.min(Math.max(raw, 0), config.geConversion.length - 1);
  return config.geConversion[index] ?? 1;
}

/** IST has one result shape, not a typology, so it publishes no codes. */
export function multiSubtestPatternCodes(): string[] {
  return [];
}
