import { z } from 'zod';

/**
 * Contract shape for the participant attempts dashboard:
 * GET /api/v1/me/attempts → MeAttemptListItemDto[] — the caller's own attempts
 * in any status (IN_PROGRESS / COMPLETED / ABANDONED) so the dashboard can
 * separate "sedang dikerjakan", "menunggu review" (resultStatus
 * PENDING_REVIEW | RETURNED), and "selesai" (APPROVED — also listed by
 * /api/v1/me/results).
 */
export const MeAttemptListItemSchema = z.object({
  id: z.string(),
  testId: z.string(),
  testName: z.string(),
  status: z.string(),
  startedAt: z.date(),
  completedAt: z.date().nullable(),
  sessionId: z.string(),
  sessionTitle: z.string(),
  resultStatus: z.string().nullable(),
});

export type MeAttemptListItemDto = z.infer<typeof MeAttemptListItemSchema>;
