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
      participantRows,
      attemptsTotal,
      attemptsInProgress,
      attemptsCompleted,
    ] = await Promise.all([
      this.prisma.sessionTest.findMany({
        where: { sessionId: id },
        orderBy: { order: 'asc' },
        include: { test: { select: { name: true } } },
      }),
      this.prisma.sessionParticipant.findMany({
        where: { sessionId: id },
        orderBy: { joinedAt: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          candidateNumber: true,
          joinedAt: true,
        },
      }),
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
      participants: participantRows,
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
        joinMode: params.joinMode,
        sessionTests: {
          create: params.tests.map((t) => ({
            testId: t.testId,
            order: t.order,
          })),
        },
        // Roster sessions: pre-created participant rows (tokenHash null until
        // a kid claims; claimedAt null until they start).
        participants: {
          create: params.roster.map((r) => ({
            name: r.name,
            candidateNumber: r.candidateNumber,
            institutionParticipantId: r.institutionParticipantId ?? null,
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

  findParticipantsBySessionId(
    sessionId: string,
  ): Promise<SessionParticipant[]> {
    return this.prisma.sessionParticipant.findMany({ where: { sessionId } });
  }

  async findAttemptsByParticipantId(
    participantId: string,
  ): Promise<
    { id: string; testId: string; testName: string; startedAt: Date | null }[]
  > {
    const attempts = await this.prisma.attempt.findMany({
      where: { participantId },
      include: { test: { select: { name: true } } },
    });
    if (attempts.length === 0) return [];
    const sessionTests = await this.prisma.sessionTest.findMany({
      where: { sessionId: attempts[0].sessionId },
      orderBy: { order: 'asc' },
      select: { testId: true },
    });
    const orderMap = new Map(sessionTests.map((st, i) => [st.testId, i]));
    return attempts
      .sort(
        (a, b) =>
          (orderMap.get(a.testId) ?? 99) - (orderMap.get(b.testId) ?? 99),
      )
      .map((a) => ({
        id: a.id,
        testId: a.testId,
        testName: a.test.name,
        startedAt: a.startedAt,
      }));
  }

  countResponsesByParticipantId(participantId: string): Promise<number> {
    return this.prisma.response.count({
      where: { attempt: { participantId } },
    });
  }

  async updateParticipantToken(id: string, tokenHash: string): Promise<void> {
    await this.prisma.sessionParticipant.update({
      where: { id },
      data: { tokenHash },
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
            phone: params.phone,
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
          phone: participantRow.phone,
          candidateNumber: participantRow.candidateNumber,
          claimedAt: participantRow.claimedAt,
          institutionParticipantId: participantRow.institutionParticipantId,
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
          resumed: false,
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
