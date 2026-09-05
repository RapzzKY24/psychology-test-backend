import { z } from 'zod';

/**
 * Contract shape for GET /api/v1/admin/results (admin results monitor):
 * flattened rows with test/session/participant names resolved server-side,
 * plus attemptId for the FE detail link.
 */
export const AdminResultListItemSchema = z.object({
  id: z.string(),
  attemptId: z.string(),
  testName: z.string(),
  sessionTitle: z.string(),
  participantName: z.string(),
  status: z.string(),
  patternCode: z.string().nullable(),
  correctedPatternCode: z.string().nullable(),
  completedAt: z.date().nullable(),
});

export type AdminResultListItemDto = z.infer<typeof AdminResultListItemSchema>;
