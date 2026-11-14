import { z } from 'zod';

/**
 * `GET /public/attempts/:id?birthDate=YYYY-MM-DD&gender=FEMALE` — only consulted
 * when the test's norm has an age band or its items differ by sex, and the
 * attempt has not recorded the value yet. The format is validated in the
 * service so a malformed value answers with `birth_date_invalid` /
 * `gender_invalid` instead of a generic `validation_failed`.
 */
export const ReadAttemptQuerySchema = z.object({
  birthDate: z.string().trim().optional(),
  gender: z.string().trim().optional(),
});

export type ReadAttemptQueryDto = z.infer<typeof ReadAttemptQuerySchema>;
