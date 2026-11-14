import type { Test, Prisma } from '../../../generated/prisma/client';

export const TESTS_REPOSITORY = 'TestsRepository';

export interface TestsRepository {
  findById(id: string): Promise<Test | null>;
  /** Full builder payload: test + ordered items + interpretations. */
  findDetailById(id: string): Promise<{
    test: Test;
    items: { id: string; order: number; content: unknown }[];
    interpretations: { patternCode: string; title: string; body: string }[];
  } | null>;
  findBySlug(slug: string): Promise<Test | null>;
  /** `take` omitted = every matching row (used by the unpaginated instansi list). */
  findMany(params: {
    skip: number;
    take?: number;
    where?: Prisma.TestWhereInput;
    orderBy?: Prisma.TestOrderByWithRelationInput;
  }): Promise<{ data: Test[]; total: number }>;
  create(data: Prisma.TestCreateInput): Promise<Test>;
  update(id: string, data: Prisma.TestUpdateInput): Promise<Test>;
  hasInProgressAttempts(testId: string): Promise<boolean>;
  /**
   * Replaces the item list. `requiresGender` is derived by the service from the
   * items themselves, so it is written in the same transaction — a test whose
   * items ship a second list must gate the attempt read on a declared sex.
   */
  replaceItems(
    testId: string,
    items: { content: unknown }[],
    options?: { requiresGender?: boolean },
  ): Promise<void>;
  replaceInterpretations(
    testId: string,
    interpretations: { patternCode: string; title: string; body: string }[],
  ): Promise<void>;
  findItemsByTestId(testId: string): Promise<{ content: unknown }[]>;
  findInterpretationsByTestId(
    testId: string,
  ): Promise<{ patternCode: string }[]>;
}
