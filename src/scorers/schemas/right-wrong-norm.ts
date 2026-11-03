import { z } from 'zod';

const IMAGE_URL_RE = /^\/uploads\/test-items\/[a-f0-9-]+\.(png|jpg)$/;

const itemBase = {
  question: z.string().trim().min(1).max(2000).optional(),
  imageUrl: z.string().trim().min(1).max(2048).optional().nullable(),
  subtest: z.string().trim().min(1).max(100).optional(),
};

const ChoiceItemSchema = z.object({
  answerMode: z.literal('choice'),
  ...itemBase,
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
  correctIndexes: z.array(z.number().int().min(0)).min(1).max(6),
});

const ShortItemSchema = z.object({
  answerMode: z.literal('short'),
  ...itemBase,
  accepted: z.array(z.string().trim().min(1).max(100)).min(1).max(10),
});

const CanonicalItemSchema = z
  .discriminatedUnion('answerMode', [ChoiceItemSchema, ShortItemSchema])
  .superRefine((data, ctx) => {
    const hasQuestion = Boolean(
      data.question && data.question.trim().length > 0,
    );
    const hasImage = Boolean(data.imageUrl && data.imageUrl.trim().length > 0);
    if (!hasQuestion && !hasImage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'question or imageUrl is required',
        path: ['question'],
      });
    }
    if (data.imageUrl && !IMAGE_URL_RE.test(data.imageUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'imageUrl must be a generated upload path',
        path: ['imageUrl'],
      });
    }
    if (
      data.answerMode === 'choice' &&
      data.correctIndexes.some((index) => index >= data.options.length)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'correctIndexes must be < options.length',
        path: ['correctIndexes'],
      });
    }
  });

/**
 * Rows written before 2026-11 have no `answerMode` and keep a single
 * `correctIndex`; they are lifted to the canonical shape here so the schema
 * (and everything downstream) only ever sees one form.
 */
function toCanonicalItem(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const raw = value as Record<string, unknown>;
  if (raw.answerMode === 'choice' || raw.answerMode === 'short') return raw;

  const { correctIndex, ...rest } = raw;
  const keys = Array.isArray(raw.correctIndexes)
    ? raw.correctIndexes
    : typeof correctIndex === 'number'
      ? [correctIndex]
      : undefined;
  return {
    ...rest,
    answerMode: 'choice',
    ...(keys ? { correctIndexes: keys } : {}),
  };
}

export const RightWrongItemContentSchema = z.preprocess(
  toCanonicalItem,
  CanonicalItemSchema,
);

export type RightWrongItemContent = z.infer<typeof CanonicalItemSchema>;
export type RightWrongChoiceItem = Extract<
  RightWrongItemContent,
  { answerMode: 'choice' }
>;
export type RightWrongShortItem = Extract<
  RightWrongItemContent,
  { answerMode: 'short' }
>;

/** Canonical form of a valid item; null when the row does not validate. */
export function parseRightWrongItem(
  content: unknown,
): RightWrongItemContent | null {
  const parsed = RightWrongItemContentSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

const ChoiceResponseSchema = z.object({
  chosen: z.array(z.number().int().min(0).max(5)).min(1).max(6),
});

const ShortResponseSchema = z.object({
  text: z.string().trim().min(1).max(200),
});

const CanonicalResponseSchema = z.union([
  ChoiceResponseSchema,
  ShortResponseSchema,
]);

/** A bare `chosen: 2` is the pre-2026-11 shape of the same answer. */
function toCanonicalResponse(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const raw = value as Record<string, unknown>;
  if (typeof raw.chosen === 'number') return { ...raw, chosen: [raw.chosen] };
  return raw;
}

export const RightWrongResponseSchema = z.preprocess(
  toCanonicalResponse,
  CanonicalResponseSchema,
);

export type RightWrongResponse = z.infer<typeof CanonicalResponseSchema>;

/** One row of the raw-to-IQ conversion table (`Test.normTable`). */
export const NormEntrySchema = z.object({
  raw: z.number().int().min(0),
  iq: z.number().int().min(0),
});

export const NormTableSchema = z.array(NormEntrySchema).min(1);

export type NormEntry = z.infer<typeof NormEntrySchema>;

export const RIGHT_WRONG_PATTERN_CATALOG: readonly string[] = Array.from(
  { length: 101 },
  (_, i) => `RAW_${i}`,
);
