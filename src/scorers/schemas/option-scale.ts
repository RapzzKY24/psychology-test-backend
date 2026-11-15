import { z } from 'zod';
import { ScaleSchema } from './likert';

/** 16PF prints exactly three options (a/b/c) under every statement. */
export const OPTION_SCALE_CHOICES = 3;

/**
 * What a pick is worth when the item does not say: option 0 is the high pole,
 * so `a` = 2, `b` = 1, `c` = 0. That is the shape of 97 of 16PF's 105 items.
 */
export const OPTION_SCALE_DEFAULT_POINTS = [2, 1, 0];

/**
 * A statement answered by picking one of three printed options. `scale` is the
 * hidden key: every item in one row of the answer sheet feeds the same factor.
 *
 * `points` is the other half of the key — what each option is worth. It has to
 * live on the item because 16PF mixes two kinds: most items score 2/1/0 with
 * the high pole printed first or last, while the eight factor-B items are
 * right/wrong and give a single point (`[0, 1, 0]`). Without it, B's raw score
 * would run to 16 where the norm table stops at 8.
 */
export const OptionScaleItemContentSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  options: z
    .array(z.string().trim().min(1).max(500))
    .length(OPTION_SCALE_CHOICES),
  scale: ScaleSchema,
  points: z
    .array(z.number().int().min(0).max(2))
    .length(OPTION_SCALE_CHOICES)
    .refine((points) => Math.max(...points) > 0, {
      message: 'Minimal satu opsi harus bernilai lebih dari 0.',
    })
    .optional(),
});

export type OptionScaleItemContent = z.infer<
  typeof OptionScaleItemContentSchema
>;

export function parseOptionScaleItem(
  content: unknown,
): OptionScaleItemContent | null {
  const parsed = OptionScaleItemContentSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

/** The item's own weights, or the 2/1/0 default. */
export function optionScalePoints(item: OptionScaleItemContent): number[] {
  return item.points ?? OPTION_SCALE_DEFAULT_POINTS;
}

/**
 * The index of the picked option. Bounded per item by `responseSchemaFor`,
 * because the option count lives in the item rather than the config.
 */
export const OptionScaleResponseSchema = z.object({
  chosen: z
    .number()
    .int()
    .min(0)
    .max(OPTION_SCALE_CHOICES - 1),
});

export type OptionScaleResponse = z.infer<typeof OptionScaleResponseSchema>;

/** Narrows `chosen` to the option count of the item being answered. */
export function optionScaleResponseSchema(itemContent?: unknown): z.ZodSchema {
  const parsed = OptionScaleItemContentSchema.safeParse(itemContent);
  const last = parsed.success
    ? parsed.data.options.length - 1
    : OPTION_SCALE_CHOICES - 1;
  return z.object({ chosen: z.number().int().min(0).max(last) });
}

/** Scales the item set can produce, in print order. */
export function optionScaleScales(items: { content: unknown }[]): string[] {
  const seen: string[] = [];
  for (const item of items) {
    const parsed = OptionScaleItemContentSchema.safeParse(item.content);
    if (!parsed.success) continue;
    if (!seen.includes(parsed.data.scale)) seen.push(parsed.data.scale);
  }
  return seen;
}

/** One interpretation per factor — 17 for 16PF. */
export function optionScalePatternCodes(
  items: { content: unknown }[],
): string[] {
  return optionScaleScales(items);
}
