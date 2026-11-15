import { z } from 'zod';
import { ScaleSchema } from './likert';

/** 16PF prints exactly three options (a/b/c) under every statement. */
export const OPTION_SCALE_CHOICES = 3;

/**
 * A statement answered by picking one of three printed options. `scale` is the
 * hidden key: every item in one row of the answer sheet feeds the same factor.
 * `reverse` says the option order runs low-to-high for this item, which 16PF
 * needs because its `a` option is not always the high pole.
 */
export const OptionScaleItemContentSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  options: z.array(z.string().trim().min(1).max(500)).length(OPTION_SCALE_CHOICES),
  scale: ScaleSchema,
  reverse: z.boolean().optional(),
});

export type OptionScaleItemContent = z.infer<typeof OptionScaleItemContentSchema>;

export function parseOptionScaleItem(
  content: unknown,
): OptionScaleItemContent | null {
  const parsed = OptionScaleItemContentSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

/**
 * The index of the picked option. Bounded per item by `responseSchemaFor`,
 * because the option count lives in the item rather than the config.
 */
export const OptionScaleResponseSchema = z.object({
  chosen: z.number().int().min(0).max(OPTION_SCALE_CHOICES - 1),
});

export type OptionScaleResponse = z.infer<typeof OptionScaleResponseSchema>;

/** Narrows `chosen` to the option count of the item being answered. */
export function optionScaleResponseSchema(itemContent?: unknown): z.ZodSchema {
  const parsed = OptionScaleItemContentSchema.safeParse(itemContent);
  const last = parsed.success ? parsed.data.options.length - 1 : OPTION_SCALE_CHOICES - 1;
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
export function optionScalePatternCodes(items: { content: unknown }[]): string[] {
  return optionScaleScales(items);
}
