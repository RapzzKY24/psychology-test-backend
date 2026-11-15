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

/**
 * One subtest of a battery (IST). The windows are absolute offsets from
 * `startedAt`, so the client ticks against the same clock the server enforces
 * and never has to know the config.
 */
export const AttemptReadSubtestSchema = z.object({
  code: z.string(),
  name: z.string(),
  kind: z.string(),
  instruction: z.string(),
  /** Item order range, both inclusive. */
  itemFrom: z.number().int(),
  itemTo: z.number().int(),
  /** Seconds after `startedAt` when the answering window opens. */
  startOffsetSec: z.number().int(),
  /** Seconds the answering window lasts. */
  durationSec: z.number().int(),
  /** Seconds of printed-list study before the window opens (ME only). */
  memorizeSec: z.number().int(),
});

export type AttemptReadSubtestDto = z.infer<typeof AttemptReadSubtestSchema>;

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
  /**
   * Seconds left, computed from `startedAt + timeLimitMin`. Null when untimed.
   * The client ticks locally from this and refetches to re-sync.
   */
  remainingSeconds: z.number().int().nullable(),
  /** The item list differs by sex, so the client must ask for one first. */
  requiresGender: z.boolean(),
  /** `MALE` / `FEMALE` once declared; null when the test does not ask. */
  gender: z.string().nullable(),
  /** The norm differs by schooling, so the client must ask for one first. */
  requiresEducation: z.boolean(),
  /** `SMP_SMA` / `S1` / `UMUM` once declared; null when the test does not ask. */
  education: z.string().nullable(),
  items: z.array(AttemptReadItemSchema),
  responses: z.array(AttemptReadResponseSchema),
  /** Present only for a battery; empty for every other family. */
  subtests: z.array(AttemptReadSubtestSchema).default([]),
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
