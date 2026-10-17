import { z } from 'zod';

/**
 * Public-safe session preview for the guest join page:
 * GET /api/v1/public/sessions/:token
 * No PIN material, no participant emails — only what a guest needs to decide
 * to join (title, ordered test names, expiry, slot usage, PIN requirement).
 */
export const PublicSessionPreviewSchema = z.object({
  sessionId: z.string(),
  title: z.string(),
  status: z.enum(['PENDING_PAYMENT', 'ACTIVE', 'CLOSED']),
  expiresAt: z.date(),
  tests: z.array(
    z.object({
      order: z.number().int(),
      testName: z.string(),
    }),
  ),
  slotLimit: z.number().int(),
  slotsUsed: z.number().int(),
  requiresPin: z.boolean(),
  joinMode: z.enum(['OPEN', 'ROSTER']),
  roster: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        candidateNumber: z.string().nullable(),
        claimed: z.boolean(),
      }),
    )
    .optional(),
});

export type PublicSessionPreviewDto = z.infer<
  typeof PublicSessionPreviewSchema
>;
