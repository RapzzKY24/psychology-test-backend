import { z } from 'zod';

/**
 * `GET /public/attempts/:id?birthDate=YYYY-MM-DD&gender=FEMALE&education=S1` —
 * only consulted when the test's norm has an age band, its items differ by sex,
 * or its norm is banded by schooling, and the attempt has not recorded the
 * value yet. The format is validated in the service so a malformed value
 * answers with `birth_date_invalid` / `gender_invalid` / `education_invalid`
 * instead of a generic `validation_failed`.
 */
export const ReadAttemptQuerySchema = z.object({
  birthDate: z.string().trim().optional(),
  gender: z.string().trim().optional(),
  education: z.string().trim().optional(),
});

export type ReadAttemptQueryDto = z.infer<typeof ReadAttemptQuerySchema>;
