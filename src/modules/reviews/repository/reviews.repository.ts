import type { TestResult } from '../../../generated/prisma/client';
import type { Prisma } from '../../../generated/prisma/client';

export const REVIEWS_REPOSITORY = 'ReviewsRepository';

export interface ReviewListItem {
  resultId: string;
  testName: string;
  sessionTitle: string;
  participantName: string;
  completedAt: Date | null;
  status: string;
  reviewNote: string | null;
}

export interface ReviewDetail {
  result: TestResult;
  test: { id: string; name: string };
  session: { id: string; title: string };
  participant: { name: string; email: string | null };
  attempt: { id: string; completedAt: Date | null };
  items: { id: string; order: number; content: unknown }[];
  responses: { itemId: string; value: unknown }[];
  interpretation: { title: string; body: string } | null;
}

export interface ReviewsRepository {
  listReviews(params: {
    where: Prisma.TestResultWhereInput;
    skip: number;
    take: number;
    orderBy?: Prisma.TestResultOrderByWithRelationInput;
  }): Promise<{ data: ReviewListItem[]; total: number }>;
  findDetailById(resultId: string): Promise<ReviewDetail | null>;
  updateNotes(resultId: string, notes: string): Promise<TestResult>;
}
