import { z } from 'zod';

export const BeginIdempotencySchema = z.object({
  scope: z.string().min(1),
  key: z.string().min(1),
  requestHash: z.string().optional(),
  ttlMinutes: z.number().int().positive().optional(),
});

export type BeginIdempotencyInput = z.infer<typeof BeginIdempotencySchema>;

export interface CompleteIdempotencyInput {
  responseStatus: number;
  responseBody?: unknown;
}

export interface FailIdempotencyInput {
  errorMessage: string;
}
