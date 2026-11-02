import { z } from 'zod';

/**
 * Body is optional: a bare POST means "backfill the whole backlog", so an
 * absent payload is coerced to `{}` before the strict object runs.
 */
export const BackfillReportsSchema = z.preprocess(
  (value) => value ?? {},
  z
    .object({
      /** Limit the run to one session instead of the whole backlog. */
      sessionId: z.string().uuid().optional(),
      /** Count the backlog without writing anything. */
      dryRun: z.boolean().default(false),
    })
    .strict(),
);

export type BackfillReportsDto = z.infer<typeof BackfillReportsSchema>;
