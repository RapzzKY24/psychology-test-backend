import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type {
  Education,
  Gender,
  TestResult,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  AttemptsRepository,
  AttemptAccessDetail,
  AttemptListItemRow,
  CompleteAttemptParams,
  ListAttemptsByUserParams,
  NormRow,
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
            scoringConfig: true,
            ageMinMonths: true,
            ageMaxMonths: true,
            requiresGender: true,
            requiresEducation: true,
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
        userId: attempt.userId,
        birthDate: attempt.birthDate,
        gender: attempt.gender,
        education: attempt.education,
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

  async setGender(attemptId: string, gender: string): Promise<void> {
    // Same null guard as the birth date: the first declaration wins, so a
    // participant cannot switch to the other list after seeing the items.
    await this.prisma.attempt.updateMany({
      where: { id: attemptId, gender: null },
      data: { gender: gender as Gender },
    });
  }

  async setEducation(attemptId: string, education: string): Promise<void> {
    // Same null guard again: the first declaration wins, so a participant
    // cannot switch to another sten table after seeing the questions.
    await this.prisma.attempt.updateMany({
      where: { id: attemptId, education: null },
      data: { education: education as Education },
    });
  }

  async findNormRows(testId: string): Promise<NormRow[]> {
    return this.prisma.normTable.findMany({
      where: { testId },
      orderBy: [{ group: 'asc' }, { scale: 'asc' }, { rawMin: 'asc' }],
      select: {
        group: true,
        scale: true,
        rawMin: true,
        rawMax: true,
        outputValue: true,
        outputLabel: true,
      },
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

  async resetExpiredAttempt(
    id: string,
  ): Promise<{ oldAttemptId: string; newAttemptId: string }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "attempts" WHERE id = ${id}::uuid FOR UPDATE`;
      const old = await tx.attempt.findUnique({
        where: { id },
        include: {
          test: { select: { timeLimitMin: true } },
          session: {
            select: { expiresAt: true, joinMode: true, status: true },
          },
          result: { select: { id: true } },
        },
      });
      if (!old) throw new NotFoundException('Attempt not found');
      if (old.status !== 'IN_PROGRESS' || old.result) {
        throw new ConflictException('attempt_not_resettable');
      }
      if (
        old.session.status !== 'ACTIVE' ||
        old.session.expiresAt.getTime() + 24 * 60 * 60_000 < Date.now()
      ) {
        throw new ConflictException('session_not_resettable');
      }
      const deadline = old.test.timeLimitMin
        ? old.startedAt.getTime() + old.test.timeLimitMin * 60_000
        : old.session.expiresAt.getTime() + 24 * 60 * 60_000;
      if (Date.now() <= deadline) {
        throw new ConflictException('attempt_not_expired');
      }
      await tx.attempt.update({ where: { id }, data: { status: 'ABANDONED' } });
      const replacement = await tx.attempt.create({
        data: {
          sessionId: old.sessionId,
          testId: old.testId,
          userId: old.userId,
          participantId: old.participantId,
          birthDate: old.birthDate,
          gender: old.gender,
          education: old.education,
          status: 'IN_PROGRESS',
        },
      });
      if (old.session.joinMode === 'ROSTER' && old.participantId) {
        await tx.sessionParticipant.update({
          where: { id: old.participantId },
          data: { tokenHash: null },
        });
      }
      return { oldAttemptId: id, newAttemptId: replacement.id };
    });
  }

  async listByUser(
    params: ListAttemptsByUserParams,
  ): Promise<{ data: AttemptListItemRow[]; total: number }> {
    const where: Prisma.AttemptWhereInput = {
      userId: params.userId,
      status: { not: 'ABANDONED' },
    };
    // A stage is what the participant sees; the two columns behind
    // "menunggu review" stay here, so the client never joins them.
    switch (params.stage) {
      case 'IN_PROGRESS':
        where.status = 'IN_PROGRESS';
        break;
      case 'AWAITING_REVIEW':
        where.status = 'COMPLETED';
        where.result = { status: 'PENDING_REVIEW' };
        break;
      case 'APPROVED':
        where.status = 'COMPLETED';
        where.result = { status: 'APPROVED' };
        break;
      case 'RETURNED':
        where.status = 'COMPLETED';
        where.result = { status: 'RETURNED' };
        break;
      default:
        break;
    }
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
