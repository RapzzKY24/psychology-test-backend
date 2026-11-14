import { z } from 'zod';

/**
 * `GET /public/attempts/:id?birthDate=YYYY-MM-DD` — only consulted when the
 * test's norm has an age band and the attempt has not recorded a date yet.
 * The format is validated in the service so a malformed value answers with
 * `birth_date_invalid` instead of a generic `validation_failed`.
 */
export const ReadAttemptQuerySchema = z.object({
  birthDate: z.string().trim().optional(),
});

export type ReadAttemptQueryDto = z.infer<typeof ReadAttemptQuerySchema>;
