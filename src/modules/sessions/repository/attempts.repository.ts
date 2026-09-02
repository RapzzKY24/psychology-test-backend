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
  test: { id: string; name: string; scorerType: string; status: string };
  session: { id: string; status: string; expiresAt: Date };
  items: { id: string; order: number; content: unknown }[];
  responses: { itemId: string; value: unknown }[];
}

export interface CompleteAttemptParams {
  attemptId: string;
  scores: Record<string, unknown>;
  patternCode: string;
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
}
