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
  deleteManyByTestId(testId: string): Promise<void>;
}
