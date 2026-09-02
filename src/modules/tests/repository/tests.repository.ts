import type { Test, Prisma } from '../../../generated/prisma/client';

export const TESTS_REPOSITORY = 'TestsRepository';

export interface TestsRepository {
  findById(id: string): Promise<Test | null>;
  findBySlug(slug: string): Promise<Test | null>;
  findMany(params: {
    skip: number;
    take: number;
    where?: Prisma.TestWhereInput;
    orderBy?: Prisma.TestOrderByWithRelationInput;
  }): Promise<{ data: Test[]; total: number }>;
  create(data: Prisma.TestCreateInput): Promise<Test>;
  update(id: string, data: Prisma.TestUpdateInput): Promise<Test>;
  hasInProgressAttempts(testId: string): Promise<boolean>;
  replaceItems(testId: string, items: { content: unknown }[]): Promise<void>;
  replaceInterpretations(
    testId: string,
    interpretations: { patternCode: string; title: string; body: string }[],
  ): Promise<void>;
  findItemsByTestId(testId: string): Promise<{ content: unknown }[]>;
  findInterpretationsByTestId(
    testId: string,
  ): Promise<{ patternCode: string }[]>;
}
