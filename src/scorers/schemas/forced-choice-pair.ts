import { z } from 'zod';

/**
 * One pole of a dichotomy. MBTI uses single letters (E/I); a later instrument
 * may use short codes. Uppercased on parse so the seed, the builder and the
 * scorer never disagree about casing.
 */
const PoleSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(3)
  .regex(/^[A-Z]+$/, 'pole must be A-Z');

/**
 * Two statements, one answer. The participant never sees `mapping` — it is the
 * hidden key that says which pole each statement scores.
 */
export const PairItemContentSchema = z
  .object({
    question: z.string().trim().min(1).max(2000),
    statements: z.array(z.string().trim().min(1).max(500)).length(2),
    mapping: z.array(PoleSchema).length(2),
  })
  .superRefine((data, ctx) => {
    if (data.mapping[0] === data.mapping[1]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'the two statements must map to different poles',
        path: ['mapping'],
      });
    }
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

export type PairItemContent = z.infer<typeof PairItemContentSchema>;

export function parsePairItem(content: unknown): PairItemContent | null {
  const parsed = PairItemContentSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

/** Index of the statement the participant picked. */
export const PairResponseSchema = z.object({
  chosen: z.number().int().min(0).max(1),
});

export type PairResponse = z.infer<typeof PairResponseSchema>;

export interface PairDimension {
  /** Canonical key: both poles sorted, so ["S","N"] and ["N","S"] are one scale. */
  key: string;
  /** Pole printed next to statement 0 of the first item in this scale. */
  left: string;
  /** Pole printed next to statement 1 of the first item in this scale. */
  right: string;
}

/**
 * Dimensions in the order they first appear in the item list. That order is
 * what turns the per-dimension winners into the pattern code ("INFP"), so it
 * must stay stable across scoring runs.
 */
export function pairDimensions(items: { content: unknown }[]): PairDimension[] {
  const seen = new Map<string, PairDimension>();
  for (const item of items) {
    const parsed = parsePairItem(item.content);
    if (!parsed) continue;
    const [left, right] = parsed.mapping;
    const key = [left, right].sort().join('');
    if (!seen.has(key)) seen.set(key, { key, left, right });
  }
  return [...seen.values()];
}

/**
 * Every pattern code this item set can produce — the cartesian product of the
 * dimensions. Publish uses it to demand one interpretation per code; deriving
 * it from the items keeps the family usable by any 2-pole instrument.
 */
export function pairPatternCodes(items: { content: unknown }[]): string[] {
  const dimensions = pairDimensions(items);
  if (dimensions.length === 0) return [];
  let codes = [''];
  for (const dimension of dimensions) {
    const next: string[] = [];
    for (const code of codes) {
      for (const pole of [dimension.left, dimension.right]) {
        next.push(code + pole);
      }
    }
    codes = next;
  }
  return codes;
}
