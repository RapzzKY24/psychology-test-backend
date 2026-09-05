import { z } from 'zod';

/**
 * Contract shapes for the participant results dashboard
 * (docs/features/08-reports-delivery.md §API contract — dashboard slice):
 * GET /api/v1/me/results        → MeResultListItemDto[]
 * GET /api/v1/me/results/:attemptId → MeResultViewDto (same shape as the
 * feature 05 public result).
 */
export const MeResultListItemSchema = z.object({
  attemptId: z.string(),
  testName: z.string(),
  patternCode: z.string(),
  completedAt: z.date().nullable(),
  approvedAt: z.date().nullable(),
});

export type MeResultListItemDto = z.infer<typeof MeResultListItemSchema>;

export const MeResultViewSchema = z.object({
  patternCode: z.string(),
  scores: z.unknown(),
  interpretation: z.object({ title: z.string(), body: z.string() }).nullable(),
  completedAt: z.date().nullable(),
});

export type MeResultViewDto = z.infer<typeof MeResultViewSchema>;
