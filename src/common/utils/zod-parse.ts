import { UnprocessableEntityException } from '@nestjs/common';
import { z } from 'zod';

/**
 * Validate `input` with a Zod schema using `safeParse` (never `parse`).
 * Throws the standard `422 validation_failed` shape from `api-contract.md`,
 * for use outside the HTTP boundary (pipes cover controllers).
 */
export function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new UnprocessableEntityException({
      statusCode: 422,
      message: 'validation_failed',
      error: 'Unprocessable Entity',
      details: result.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      ),
    });
  }
  return result.data;
}
