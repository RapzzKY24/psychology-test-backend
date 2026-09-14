import { z } from 'zod';

export const RightWrongItemContentSchema = z
  .object({
    question: z.string().trim().min(1).max(2000).optional(),
    imageUrl: z.string().trim().min(1).max(2048).optional(),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
    correctIndex: z.number().int().min(0),
    subtest: z.string().trim().min(1).max(100).optional(),
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
    if (data.correctIndex >= data.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'correctIndex must be < options.length',
        path: ['correctIndex'],
      });
    }
  });

export type RightWrongItemContent = z.infer<typeof RightWrongItemContentSchema>;

export const RightWrongResponseSchema = z.object({
  chosen: z.number().int().min(0).max(5),
});

export type RightWrongResponse = z.infer<typeof RightWrongResponseSchema>;

export const RIGHT_WRONG_PATTERN_CATALOG: readonly string[] = Array.from(
  { length: 101 },
  (_, i) => `RAW_${i}`,
);
