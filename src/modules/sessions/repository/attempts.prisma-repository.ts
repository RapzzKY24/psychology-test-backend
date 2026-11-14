import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type { TestResult } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  AttemptsRepository,
  AttemptAccessDetail,
  AttemptListItemRow,
  CompleteAttemptParams,
} from './attempts.repository';

@Injectable()
export class PrismaAttemptsRepository implements AttemptsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAccessDetail(id: string): Promise<AttemptAccessDetail | null> {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id },
      include: {
        test: {
          select: {
            id: true,
            name: true,
            scorerType: true,
            status: true,
            timeLimitMin: true,
            normTable: true,
            ageMinMonths: true,
            ageMaxMonths: true,
          },
        },
        session: { select: { id: true, status: true, expiresAt: true } },
        responses: { select: { itemId: true, value: true } },
      },
    });
    if (!attempt) return null;

    const items = await this.prisma.testItem.findMany({
      where: { testId: attempt.testId },
      orderBy: { order: 'asc' },
      select: { id: true, order: true, content: true },
    });

    return {
      attempt: {
        id: attempt.id,
        sessionId: attempt.sessionId,
        testId: attempt.testId,
        status: attempt.status,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
        participantId: attempt.participantId,
        birthDate: attempt.birthDate,
      },
      test: attempt.test,
      session: attempt.session,
      items,
      responses: attempt.responses,
    };
  }

  async setBirthDate(attemptId: string, birthDate: Date): Promise<void> {
    // `updateMany` with a null guard keeps a concurrent second call from
    // overwriting the first date the participant declared.
    await this.prisma.attempt.updateMany({
      where: { id: attemptId, birthDate: null },
      data: { birthDate },
    });
  }

  async upsertResponse(
    attemptId: string,
    itemId: string,
    value: unknown,
  ): Promise<void> {
    await this.prisma.response.upsert({
      where: { attemptId_itemId: { attemptId, itemId } },
      create: {
        attemptId,
        itemId,
        value: value as Prisma.InputJsonValue,
      },
      update: {
        value: value as Prisma.InputJsonValue,
        answeredAt: new Date(),
      },
    });
  }

  findResultByAttemptId(attemptId: string): Promise<TestResult | null> {
    return this.prisma.testResult.findUnique({ where: { attemptId } });
  }

  async completeAndCreateResult(
    params: CompleteAttemptParams,
  ): Promise<TestResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const result = await tx.testResult.create({
          data: {
            attemptId: params.attemptId,
            scores: params.scores as Prisma.InputJsonValue,
            patternCode: params.patternCode,
            status: 'PENDING_REVIEW',
          },
        });
        await tx.attempt.update({
          where: { id: params.attemptId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        return result;
      });
    } catch (error) {
      // D4 safety net: concurrent/retried complete hits the unique attemptId.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.findResultByAttemptId(params.attemptId);
        if (existing) return existing;
      }
      throw error;
    }
  }

  async listByUser(params: {
    userId: string;
    skip: number;
    take: number;
  }): Promise<{ data: AttemptListItemRow[]; total: number }> {
    const where = { userId: params.userId };
    const [rows, total] = await Promise.all([
      this.prisma.attempt.findMany({
        where,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        skip: params.skip,
        take: params.take,
        select: {
          id: true,
          testId: true,
          status: true,
          startedAt: true,
          completedAt: true,
          sessionId: true,
          test: { select: { name: true } },
          session: { select: { title: true } },
          result: { select: { status: true } },
        },
      }),
      this.prisma.attempt.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        testId: row.testId,
        testName: row.test.name,
        status: row.status,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        sessionId: row.sessionId,
        sessionTitle: row.session.title,
        resultStatus: row.result?.status ?? null,
      })),
      total,
    };
  }
}
