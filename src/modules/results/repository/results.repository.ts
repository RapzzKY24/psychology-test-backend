import type { TestResult, Prisma } from '../../../generated/prisma/client';

export const RESULTS_REPOSITORY = 'ResultsRepository';

/** Flat row for the participant dashboard list (feature 08 §API contract). */
export interface ApprovedResultRow {
  attemptId: string;
  testName: string;
  patternCode: string;
  correctedPatternCode: string | null;
  completedAt: Date | null;
  approvedAt: Date | null;
}

export interface ResultsRepository {
  findResultByAttemptId(attemptId: string): Promise<TestResult | null>;
  findAttemptWithResult(attemptId: string): Promise<{
    attempt: {
      id: string;
      userId: string | null;
      participantId: string | null;
      status: string;
      completedAt: Date | null;
    };
    test: { id: string };
    result: TestResult | null;
  } | null>;
  findResultWithInterpretation(
    resultId: string,
  ): Promise<
    | (TestResult & { interpretation: { title: string; body: string } | null })
    | null
  >;
  findInterpretationByPattern(
    testId: string,
    patternCode: string,
  ): Promise<{ title: string; body: string } | null>;
  findAttemptOwner(
    attemptId: string,
  ): Promise<{ userId: string | null; participantId: string | null } | null>;
  listResults(params: {
    where: Prisma.TestResultWhereInput;
    skip: number;
    take: number;
    orderBy?: Prisma.TestResultOrderByWithRelationInput;
  }): Promise<{ data: TestResult[]; total: number }>;
  listApprovedByUser(params: {
    userId: string;
    skip: number;
    take: number;
  }): Promise<{ data: ApprovedResultRow[]; total: number }>;
}
