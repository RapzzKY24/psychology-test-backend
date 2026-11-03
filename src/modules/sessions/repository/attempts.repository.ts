import type { TestResult } from '../../../generated/prisma/client';

export const ATTEMPTS_REPOSITORY = 'AttemptsRepository';

export interface AttemptAccessDetail {
  attempt: {
    id: string;
    sessionId: string;
    testId: string;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    participantId: string | null;
  };
  test: {
    id: string;
    name: string;
    scorerType: string;
    status: string;
    /** Hard limit in minutes; null = untimed. */
    timeLimitMin: number | null;
    /** Raw -> IQ rows, null when the test has no norm. */
    normTable: unknown;
  };
  session: { id: string; status: string; expiresAt: Date };
  items: { id: string; order: number; content: unknown }[];
  responses: { itemId: string; value: unknown }[];
}

export interface CompleteAttemptParams {
  attemptId: string;
  scores: Record<string, unknown>;
  patternCode: string;
}

/** Flattened row for the participant attempts dashboard (userId-owned only). */
export interface AttemptListItemRow {
  id: string;
  testId: string;
  testName: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  sessionId: string;
  sessionTitle: string;
  resultStatus: string | null;
}

export interface ListAttemptsByUserParams {
  userId: string;
  skip: number;
  take: number;
}

export interface AttemptsRepository {
  findAccessDetail(id: string): Promise<AttemptAccessDetail | null>;
  upsertResponse(
    attemptId: string,
    itemId: string,
    value: unknown,
  ): Promise<void>;
  findResultByAttemptId(attemptId: string): Promise<TestResult | null>;
  completeAndCreateResult(params: CompleteAttemptParams): Promise<TestResult>;
  listByUser(params: ListAttemptsByUserParams): Promise<{
    data: AttemptListItemRow[];
    total: number;
  }>;
}
