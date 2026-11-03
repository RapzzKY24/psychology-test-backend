import { z } from 'zod';

const IMAGE_URL_RE = /^\/uploads\/test-items\/[a-f0-9-]+\.(png|jpg)$/;

/**
 * Two answer shapes share one scorer:
 * - `choice`: numbered options; `correctIndexes` holds 1 key (radio) or more (checkbox).
 * - `short`: typed answer matched against a list of accepted variants.
 * `answerMode` is optional on the wire so pre-2026-11 items (plain
 * `correctIndex`) keep validating; they are read as `choice`.
 */
export const RightWrongItemContentSchema = z
  .object({
    answerMode: z.enum(['choice', 'short']).optional(),
    question: z.string().trim().min(1).max(2000).optional(),
    imageUrl: z.string().trim().min(1).max(2048).optional().nullable(),
    subtest: z.string().trim().min(1).max(100).optional(),
    options: z
      .array(z.string().trim().min(1).max(500))
      .min(2)
      .max(6)
      .optional(),
    correctIndexes: z.array(z.number().int().min(0)).min(1).max(6).optional(),
    /** Legacy single key, still accepted from older payloads and rows. */
    correctIndex: z.number().int().min(0).optional(),
    accepted: z
      .array(z.string().trim().min(1).max(100))
      .min(1)
      .max(10)
      .optional(),
  })
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

    if ((data.answerMode ?? 'choice') === 'short') {
      if (!data.accepted || data.accepted.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'accepted is required for a short-answer item',
          path: ['accepted'],
        });
      }
      return;
    }

    if (!data.options || data.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'options must have at least 2 entries',
        path: ['options'],
      });
      return;
    }
    const keys =
      data.correctIndexes ??
      (data.correctIndex !== undefined ? [data.correctIndex] : []);
    if (keys.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'correctIndexes is required for a choice item',
        path: ['correctIndexes'],
      });
      return;
    }
    if (keys.length > data.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'correctIndexes cannot exceed options length',
        path: ['correctIndexes'],
      });
    }
    if (keys.some((k) => k >= data.options!.length)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'correctIndexes must be < options.length',
        path: ['correctIndexes'],
      });
    }
  });

export type RightWrongItemInput = z.infer<typeof RightWrongItemContentSchema>;

export interface RightWrongChoiceItem {
  answerMode: 'choice';
  question?: string;
  imageUrl?: string | null;
  subtest?: string;
  options: string[];
  correctIndexes: number[];
}

export interface RightWrongShortItem {
  answerMode: 'short';
  question?: string;
  imageUrl?: string | null;
  subtest?: string;
  accepted: string[];
}

export type RightWrongItemContent = RightWrongChoiceItem | RightWrongShortItem;

/** Canonical form of a valid item; null when the row does not validate. */
export function parseRightWrongItem(
  content: unknown,
): RightWrongItemContent | null {
  const parsed = RightWrongItemContentSchema.safeParse(content);
  if (!parsed.success) return null;
  const data = parsed.data;
  const shared = {
    question: data.question,
    imageUrl: data.imageUrl,
    subtest: data.subtest,
  };
  if ((data.answerMode ?? 'choice') === 'short') {
    return { answerMode: 'short', ...shared, accepted: data.accepted! };
  }
  const keys =
    data.correctIndexes ??
    (data.correctIndex !== undefined ? [data.correctIndex] : []);
  return {
    answerMode: 'choice',
    ...shared,
    options: data.options!,
    correctIndexes: [...new Set(keys)].sort((a, b) => a - b),
  };
}

/**
 * `chosen` is a single number for a radio item and an array for a checkbox
 * item; the bare number form is the pre-2026-11 shape.
 */
export const RightWrongResponseSchema = z
  .object({
    chosen: z
      .union([
        z.number().int().min(0).max(5),
        z.array(z.number().int().min(0).max(5)).min(1).max(6),
      ])
      .optional(),
    text: z.string().trim().min(1).max(200).optional(),
  })
  .refine((v) => v.chosen !== undefined || v.text !== undefined, {
    message: 'chosen or text is required',
  });

export type RightWrongResponseInput = z.infer<typeof RightWrongResponseSchema>;

export interface RightWrongChoiceResponse {
  chosen: number[];
}

export interface RightWrongShortResponse {
  text: string;
}

export type RightWrongResponse =
  RightWrongChoiceResponse | RightWrongShortResponse;

export function parseRightWrongResponse(
  value: unknown,
): RightWrongResponse | null {
  const parsed = RightWrongResponseSchema.safeParse(value);
  if (!parsed.success) return null;
  if (typeof parsed.data.text === 'string') {
    return { text: parsed.data.text };
  }
  const chosen = parsed.data.chosen;
  if (typeof chosen === 'number') return { chosen: [chosen] };
  return chosen ? { chosen: [...chosen] } : null;
}

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
