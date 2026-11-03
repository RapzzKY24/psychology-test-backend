import { z } from 'zod';
import type { TestResult } from '../../../generated/prisma/client';

export const AttemptReadItemSchema = z.object({
  id: z.string(),
  order: z.number().int(),
  content: z.record(z.string(), z.unknown()),
});

export type AttemptReadItemDto = z.infer<typeof AttemptReadItemSchema>;

export const AttemptReadResponseSchema = z.object({
  itemId: z.string(),
  value: z.unknown(),
});

export type AttemptReadResponseDto = z.infer<typeof AttemptReadResponseSchema>;

export const AttemptReadSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  testId: z.string(),
  testName: z.string(),
  scorerType: z.string(),
  status: z.string(),
  startedAt: z.date(),
  completedAt: z.date().nullable(),
  /** Hard limit in minutes; null = untimed. */
  timeLimitMin: z.number().int().nullable(),
  /** `startedAt + timeLimitMin`; null when untimed. Server truth for the countdown. */
  deadlineAt: z.date().nullable(),
  /** Server clock, so the client never trusts the local one. */
  serverNow: z.date(),
  items: z.array(AttemptReadItemSchema),
  responses: z.array(AttemptReadResponseSchema),
});

export type AttemptReadDto = z.infer<typeof AttemptReadSchema>;

export const AttemptCompleteResponseSchema = z.object({
  id: z.string(),
  testId: z.string(),
  testName: z.string(),
  status: z.string(),
  completedAt: z.date(),
  /** Prisma row, passed through untouched — not re-validated at runtime. */
  result: z.custom<TestResult>(),
});

export type AttemptCompleteResponseDto = z.infer<
  typeof AttemptCompleteResponseSchema
>;
