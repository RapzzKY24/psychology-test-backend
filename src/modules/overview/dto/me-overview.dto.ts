import { z } from 'zod';

/**
 * The participant dashboard's first screen: five counts plus the three newest
 * rows of each kind. One request instead of four, because every number on that
 * screen is read together.
 */
export const MeOverviewSchema = z.object({
  counts: z.object({
    inProgress: z.number().int(),
    awaitingReview: z.number().int(),
    resultsReady: z.number().int(),
    certificatesReady: z.number().int(),
    pendingOrders: z.number().int(),
  }),
  activeAttempts: z.array(
    z.object({
      attemptId: z.string(),
      testName: z.string(),
      startedAt: z.date(),
    }),
  ),
  latestResults: z.array(
    z.object({
      attemptId: z.string(),
      testName: z.string(),
      patternCode: z.string(),
      approvedAt: z.date().nullable(),
    }),
  ),
  latestCertificates: z.array(
    z.object({
      id: z.string(),
      number: z.string(),
      testName: z.string(),
      issuedAt: z.date(),
    }),
  ),
  latestOrders: z.array(
    z.object({
      orderId: z.string(),
      testName: z.string(),
      amount: z.number().int(),
      paidAt: z.date(),
    }),
  ),
  latestUnpaidOrders: z.array(
    z.object({
      orderId: z.string(),
      testName: z.string(),
      amount: z.number().int(),
      createdAt: z.date(),
      expiresAt: z.date(),
    }),
  ),
  latestCompletedAttempts: z.array(
    z.object({
      attemptId: z.string(),
      testName: z.string(),
      completedAt: z.date(),
    }),
  ),
});

export type MeOverviewDto = z.infer<typeof MeOverviewSchema>;
