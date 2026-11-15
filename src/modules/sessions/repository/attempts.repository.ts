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
    /** Declared birth date, recorded the first time a banded test is opened. */
    birthDate: Date | null;
    /** Declared sex, recorded the first time a gendered test is opened. */
    gender: string | null;
    /** Declared schooling, recorded the first time an education-banded test is opened. */
    education: string | null;
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
    /** Family settings the scorer reads, null when the family needs none. */
    scoringConfig: unknown;
    /** Norm age band in whole months; both null when the norm is not banded. */
    ageMinMonths: number | null;
    ageMaxMonths: number | null;
    /** The item list differs by sex, so the attempt must record one first. */
    requiresGender: boolean;
    /** The norm differs by schooling, so the attempt must record one first. */
    requiresEducation: boolean;
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

/** One lookup segment of the test's norm table (ADR-011). */
export interface NormRow {
  group: string;
  scale: string | null;
  rawMin: number;
  rawMax: number;
  outputValue: number;
  outputLabel: string | null;
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
  /** Records the declared birth date once; later calls are a no-op. */
  setBirthDate(attemptId: string, birthDate: Date): Promise<void>;
  /** Records the declared sex once; later calls are a no-op. */
  setGender(attemptId: string, gender: string): Promise<void>;
  /** Records the declared schooling once; later calls are a no-op. */
  setEducation(attemptId: string, education: string): Promise<void>;
  /** Every norm segment of one test; empty for families that read no table. */
  findNormRows(testId: string): Promise<NormRow[]>;
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
