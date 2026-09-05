import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TestResult, Prisma } from '../../../generated/prisma/client';
import type {
  AdminResultRow,
  ResultsRepository,
  ApprovedResultRow,
} from './results.repository';

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
  }): Promise<{ data: AdminResultRow[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.prisma.testResult.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
        orderBy: { computedAt: 'desc' },
        include: {
          attempt: {
            include: {
              test: { select: { name: true } },
              session: { select: { title: true } },
              // Attempt has no User relation — user names resolved separately.
              participant: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.testResult.count({ where: params.where }),
    ]);
    // Resolve account-owner names for user-owned attempts in one query.
    const userIds = rows
      .map((row) => row.attempt.userId)
      .filter((id): id is string => Boolean(id));
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const userNameById = new Map(users.map((user) => [user.id, user.name]));

    return {
      data: rows.map((row) => ({
        id: row.id,
        attemptId: row.attemptId,
        testName: row.attempt.test.name,
        sessionTitle: row.attempt.session.title,
        // Admin monitor: unmasked (ops needs to identify people).
        participantName:
          row.attempt.participant?.name ??
          userNameById.get(row.attempt.userId ?? '') ??
          'Unknown',
        status: row.status,
        patternCode: row.patternCode,
        correctedPatternCode: row.correctedPatternCode,
        completedAt: row.attempt.completedAt,
      })),
      total,
    };
  }

  async listApprovedByUser(params: {
    userId: string;
    skip: number;
    take: number;
  }): Promise<{ data: ApprovedResultRow[]; total: number }> {
    const where: Prisma.TestResultWhereInput = {
      status: 'APPROVED',
      attempt: { userId: params.userId },
    };
    const [rows, total] = await Promise.all([
      this.prisma.testResult.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { reviewedAt: 'desc' },
        select: {
          attemptId: true,
          patternCode: true,
          correctedPatternCode: true,
          reviewedAt: true,
          attempt: {
            select: {
              completedAt: true,
              test: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.testResult.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        attemptId: row.attemptId,
        testName: row.attempt.test.name,
        patternCode: row.patternCode,
        correctedPatternCode: row.correctedPatternCode,
        completedAt: row.attempt.completedAt,
        approvedAt: row.reviewedAt,
      })),
      total,
    };
  }
}
