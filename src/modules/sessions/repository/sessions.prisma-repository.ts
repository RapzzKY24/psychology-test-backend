import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TestSession } from '../../../generated/prisma/client';
import type {
  SessionsRepository,
  SessionDetail,
  CreateSessionParams,
} from './sessions.repository';

@Injectable()
export class PrismaSessionsRepository implements SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<TestSession | null> {
    return this.prisma.testSession.findUnique({ where: { id } });
  }

  async findDetailById(id: string): Promise<SessionDetail | null> {
    const session = await this.prisma.testSession.findUnique({
      where: { id },
    });
    if (!session) return null;

    const [
      sessionTests,
      participants,
      attemptsTotal,
      attemptsInProgress,
      attemptsCompleted,
    ] = await Promise.all([
      this.prisma.sessionTest.findMany({
        where: { sessionId: id },
        orderBy: { order: 'asc' },
        include: { test: { select: { name: true } } },
      }),
      this.prisma.sessionParticipant.count({ where: { sessionId: id } }),
      this.prisma.attempt.count({ where: { sessionId: id } }),
      this.prisma.attempt.count({
        where: { sessionId: id, status: 'IN_PROGRESS' },
      }),
      this.prisma.attempt.count({
        where: { sessionId: id, status: 'COMPLETED' },
      }),
    ]);

    return {
      session,
      tests: sessionTests.map((st) => ({
        id: st.id,
        testId: st.testId,
        testName: st.test.name,
        order: st.order,
      })),
      participants,
      attempts: {
        total: attemptsTotal,
        inProgress: attemptsInProgress,
        completed: attemptsCompleted,
      },
    };
  }

  async findMany(params: {
    skip: number;
    take: number;
  }): Promise<{ data: TestSession[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.testSession.findMany({
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.testSession.count(),
    ]);
    return { data, total };
  }

  findByToken(token: string): Promise<TestSession | null> {
    return this.prisma.testSession.findUnique({ where: { token } });
  }

  findTestsByIds(ids: string[]): Promise<{ id: string; status: string }[]> {
    return this.prisma.test.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    });
  }

  findInstitutionById(id: string): Promise<{ id: string } | null> {
    return this.prisma.institution.findUnique({
      where: { id },
      select: { id: true },
    });
  }

  createWithTests(params: CreateSessionParams): Promise<TestSession> {
    return this.prisma.testSession.create({
      data: {
        title: params.title,
        kind: params.kind,
        institutionId: params.institutionId,
        createdById: params.createdById,
        token: params.token,
        pinHash: params.pinHash,
        slotLimit: params.slotLimit,
        expiresAt: params.expiresAt,
        sessionTests: {
          create: params.tests.map((t) => ({
            testId: t.testId,
            order: t.order,
          })),
        },
      },
    });
  }

  updateStatus(id: string, status: 'ACTIVE' | 'CLOSED'): Promise<TestSession> {
    return this.prisma.testSession.update({
      where: { id },
      data: { status },
    });
  }
}
