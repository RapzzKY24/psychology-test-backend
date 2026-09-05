import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type {
  SessionParticipant,
  TestSession,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  SessionsRepository,
  SessionDetail,
  CreateSessionParams,
  JoinSessionParams,
  JoinSessionResult,
  SessionTestSummary,
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

  countParticipants(sessionId: string): Promise<number> {
    return this.prisma.sessionParticipant.count({ where: { sessionId } });
  }

  async findSessionTestsBySessionId(
    sessionId: string,
  ): Promise<SessionTestSummary[]> {
    const rows = await this.prisma.sessionTest.findMany({
      where: { sessionId },
      orderBy: { order: 'asc' },
      include: { test: { select: { name: true, status: true } } },
    });
    return rows.map((st) => ({
      testId: st.testId,
      testName: st.test.name,
      testStatus: st.test.status,
      order: st.order,
    }));
  }

  findParticipantByTokenHash(
    tokenHash: string,
  ): Promise<SessionParticipant | null> {
    return this.prisma.sessionParticipant.findUnique({
      where: { tokenHash },
    });
  }

  async joinSession(params: JoinSessionParams): Promise<JoinSessionResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Row lock serializes concurrent joins → slot count + create are atomic (decision D3).
        await tx.$queryRaw`SELECT id FROM "test_sessions" WHERE id = ${params.sessionId}::uuid FOR UPDATE`;
        const session = await tx.testSession.findUnique({
          where: { id: params.sessionId },
        });
        if (!session) throw new NotFoundException('Session not found');

        const participants = await tx.sessionParticipant.count({
          where: { sessionId: params.sessionId },
        });
        if (participants >= session.slotLimit) {
          throw new ConflictException('session_full');
        }

        const sessionTests = await tx.sessionTest.findMany({
          where: { sessionId: params.sessionId },
          orderBy: { order: 'asc' },
          include: { test: { select: { name: true } } },
        });

        const participantRow = await tx.sessionParticipant.create({
          data: {
            sessionId: params.sessionId,
            name: params.name,
            email: params.email,
            candidateNumber: params.candidateNumber,
            tokenHash: params.tokenHash,
          },
        });

        // Never expose tokenHash (or pinHash) to the client — it is the guest's credential.
        const participant: Omit<typeof participantRow, 'tokenHash'> = {
          id: participantRow.id,
          sessionId: participantRow.sessionId,
          name: participantRow.name,
          email: participantRow.email,
          candidateNumber: participantRow.candidateNumber,
          joinedAt: participantRow.joinedAt,
        };

        const attempts = await Promise.all(
          sessionTests.map((st) =>
            tx.attempt.create({
              data: {
                sessionId: params.sessionId,
                testId: st.testId,
                participantId: participant.id,
                status: 'IN_PROGRESS',
              },
            }),
          ),
        );

        return {
          participant,
          participantToken: params.participantToken,
          attempts: attempts.map((a, i) => ({
            id: a.id,
            testId: a.testId,
            testName: sessionTests[i].test.name,
          })),
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target =
          (error.meta?.target as string[] | string | undefined)?.toString() ??
          '';
        // Only map participant/tokenHash collisions to session_full; other uniques should bubble
        if (
          target.includes('tokenHash') ||
          target.includes('sessionParticipant')
        ) {
          throw new ConflictException('session_full');
        }
      }
      throw error;
    }
  }
}
