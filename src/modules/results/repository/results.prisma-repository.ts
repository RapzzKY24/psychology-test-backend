import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TestResult, Prisma } from '../../../generated/prisma/client';
import type { ResultsRepository } from './results.repository';

@Injectable()
export class PrismaResultsRepository implements ResultsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findResultByAttemptId(attemptId: string): Promise<TestResult | null> {
    return this.prisma.testResult.findUnique({ where: { attemptId } });
  }

  async findAttemptWithResult(attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        userId: true,
        participantId: true,
        status: true,
        testId: true,
        completedAt: true,
      },
    });
    if (!attempt) return null;
    const result = await this.prisma.testResult.findUnique({
      where: { attemptId },
    });
    return {
      attempt: {
        id: attempt.id,
        userId: attempt.userId,
        participantId: attempt.participantId,
        status: attempt.status,
        completedAt: attempt.completedAt,
      },
      test: { id: attempt.testId },
      result,
    };
  }

  async findResultWithInterpretation(resultId: string) {
    const result = await this.prisma.testResult.findUnique({
      where: { id: resultId },
    });
    if (!result) return null;
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: result.attemptId },
      select: { testId: true },
    });
    if (!attempt)
      return { ...result, interpretation: null } as unknown as TestResult & {
        interpretation: { title: string; body: string } | null;
      };
    const interpretation = await this.prisma.interpretation.findUnique({
      where: {
        testId_patternCode: {
          testId: attempt.testId,
          patternCode: result.patternCode,
        },
      },
      select: { title: true, body: true },
    });
    return { ...result, interpretation } as unknown as TestResult & {
      interpretation: { title: string; body: string } | null;
    };
  }

  async findInterpretationByPattern(testId: string, patternCode: string) {
    const interp = await this.prisma.interpretation.findUnique({
      where: { testId_patternCode: { testId, patternCode } },
      select: { title: true, body: true },
    });
    return interp;
  }

  async findAttemptOwner(attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      select: { userId: true, participantId: true },
    });
    if (!attempt) return null;
    return { userId: attempt.userId, participantId: attempt.participantId };
  }

  async listResults(params: {
    where: Prisma.TestResultWhereInput;
    skip: number;
    take: number;
    orderBy?: Prisma.TestResultOrderByWithRelationInput;
  }): Promise<{ data: TestResult[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.testResult.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy ?? { computedAt: 'desc' },
      }),
      this.prisma.testResult.count({ where: params.where }),
    ]);
    return { data, total };
  }
}
