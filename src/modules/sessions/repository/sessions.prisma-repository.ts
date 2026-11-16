import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type {
  SessionParticipant,
  TestSession,
  Invoice,
} from '../../../generated/prisma/client';
import { generateInviteToken } from '../utils/generate-invite-token';
import { generateInvoiceNumber } from '../../invoices/utils/generate-invoice-number';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  SessionsRepository,
  SessionDetail,
  SessionTestsSummary,
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
      attemptRows,
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
          institutionParticipantId: true,
          tokenHash: true,
        },
      }),
      this.prisma.attempt.findMany({
        where: { sessionId: id },
        select: { id: true, participantId: true },
      }),
      this.prisma.attempt.count({ where: { sessionId: id } }),
      this.prisma.attempt.count({
        where: { sessionId: id, status: 'IN_PROGRESS' },
      }),
      this.prisma.attempt.count({
        where: { sessionId: id, status: 'COMPLETED' },
      }),
    ]);

    const answeredByParticipant =
      await this.countResponsesByParticipant(attemptRows);

    return {
      session,
      tests: sessionTests.map((st) => ({
        id: st.id,
        testId: st.testId,
        testName: st.test.name,
        order: st.order,
      })),
      participants: participantRows.map(
        ({ tokenHash, institutionParticipantId, ...row }) => ({
          ...row,
          employeeId: institutionParticipantId,
          claimed: tokenHash != null,
          answeredCount: answeredByParticipant.get(row.id) ?? 0,
        }),
      ),
      attempts: {
        total: attemptsTotal,
        inProgress: attemptsInProgress,
        completed: attemptsCompleted,
      },
    };
  }

  /** Maps each participant to the number of responses submitted by its seats. */
  private async countResponsesByParticipant(
    attempts: { id: string; participantId: string | null }[],
  ): Promise<Map<string, number>> {
    const answeredByParticipant = new Map<string, number>();
    if (attempts.length === 0) return answeredByParticipant;

    const counts = await this.prisma.response.groupBy({
      by: ['attemptId'],
      where: { attemptId: { in: attempts.map((a) => a.id) } },
      _count: { _all: true },
    });
    const answeredByAttempt = new Map(
      counts.map((c) => [c.attemptId, c._count._all]),
    );

    for (const attempt of attempts) {
      if (!attempt.participantId) continue;
      answeredByParticipant.set(
        attempt.participantId,
        (answeredByParticipant.get(attempt.participantId) ?? 0) +
          (answeredByAttempt.get(attempt.id) ?? 0),
      );
    }
    return answeredByParticipant;
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

  async findManyByInstitution(
    institutionId: string,
    params: { skip: number; take: number },
  ): Promise<{ data: TestSession[]; total: number }> {
    const where = { institutionId };
    const [data, total] = await Promise.all([
      this.prisma.testSession.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.testSession.count({ where }),
    ]);
    return { data, total };
  }

  countSessionsByInstitution(institutionId: string): Promise<number> {
    return this.prisma.testSession.count({ where: { institutionId } });
  }

  async getAttemptStatsByInstitution(
    institutionId: string,
  ): Promise<SessionTestsSummary> {
    const groups = await this.prisma.attempt.groupBy({
      by: ['status'],
      where: { session: { institutionId } },
      _count: { _all: true },
    });
    const countOf = (status: string): number =>
      groups.find((g) => g.status === status)?._count._all ?? 0;
    const total = groups.reduce((sum, g) => sum + g._count._all, 0);
    return {
      total,
      inProgress: countOf('IN_PROGRESS'),
      completed: countOf('COMPLETED'),
    };
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
        status: params.status,
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

  async createInstitutionBatch(params: {
    session: Omit<CreateSessionParams, 'token'>;
    amount: number;
    invoiceExpiresAt: Date;
  }): Promise<{ session: TestSession; invoice: Invoice }> {
    const institutionId = params.session.institutionId;
    if (!institutionId) throw new NotFoundException('Institution not found');
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const session = await tx.testSession.create({
            data: {
              title: params.session.title,
              kind: 'GROUP',
              institutionId,
              createdById: params.session.createdById,
              token: generateInviteToken(),
              pinHash: params.session.pinHash,
              slotLimit: params.session.slotLimit,
              expiresAt: params.session.expiresAt,
              joinMode: 'ROSTER',
              status: 'PENDING_PAYMENT',
              sessionTests: {
                create: params.session.tests.map((test) => ({
                  testId: test.testId,
                  order: test.order,
                })),
              },
              participants: {
                create: params.session.roster.map((seat) => ({
                  name: seat.name,
                  candidateNumber: seat.candidateNumber,
                  institutionParticipantId:
                    seat.institutionParticipantId ?? null,
                })),
              },
            },
          });
          await tx.$queryRaw`WITH "lock" AS (SELECT pg_advisory_xact_lock(hashtext(${`INV-${year}`}))) SELECT count(*) FROM "lock"`;
          const last = await tx.invoice.findFirst({
            where: { number: { startsWith: `INV-${year}-` } },
            orderBy: { number: 'desc' },
            select: { number: true },
          });
          const sequence = last ? Number(last.number.split('-')[2]) + 1 : 1;
          const invoice = await tx.invoice.create({
            data: {
              institutionId,
              sessionId: session.id,
              amount: params.amount,
              number: generateInvoiceNumber(year, sequence),
              expiresAt: params.invoiceExpiresAt,
              status: 'UNPAID',
            },
          });
          return { session, invoice };
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002' && attempt < 4)
          continue;
        throw error;
      }
    }
    throw new ConflictException('batch_create_collision');
  }

  updateStatus(id: string, status: 'ACTIVE' | 'CLOSED'): Promise<TestSession> {
    return this.prisma.testSession.update({
      where: { id },
      data: { status },
    });
  }

  update(
    id: string,
    data: { title?: string; expiresAt?: Date },
  ): Promise<TestSession> {
    return this.prisma.testSession.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt } : {}),
      },
    });
  }

  countParticipants(sessionId: string): Promise<number> {
    return this.prisma.sessionParticipant.count({ where: { sessionId } });
  }

  async createParticipants(
    sessionId: string,
    rows: {
      name: string;
      candidateNumber?: string | null;
      institutionParticipantId?: string | null;
    }[],
  ): Promise<number> {
    const result = await this.prisma.sessionParticipant.createMany({
      data: rows.map((r) => ({
        sessionId,
        name: r.name,
        candidateNumber: r.candidateNumber ?? null,
        institutionParticipantId: r.institutionParticipantId ?? null,
      })),
    });
    return result.count;
  }

  updateParticipant(
    id: string,
    data: { name?: string; institutionParticipantId?: string | null },
  ): Promise<SessionParticipant> {
    return this.prisma.sessionParticipant.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.institutionParticipantId !== undefined
          ? { institutionParticipantId: data.institutionParticipantId }
          : {}),
      },
    });
  }

  async deleteParticipant(id: string): Promise<void> {
    await this.prisma.sessionParticipant.delete({ where: { id } });
  }

  resetParticipantToken(id: string): Promise<SessionParticipant> {
    return this.prisma.sessionParticipant.update({
      where: { id },
      data: { tokenHash: null },
    });
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
      where: { participantId, status: { not: 'ABANDONED' } },
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

  async updateParticipantToken(
    id: string,
    tokenHash: string,
    claimedAt?: Date,
  ): Promise<void> {
    await this.prisma.sessionParticipant.update({
      where: { id },
      data: { tokenHash, ...(claimedAt ? { claimedAt } : {}) },
    });
  }

  async claimSeatWithAttempts(params: {
    seatId: string;
    tokenHash: string;
    claimedAt: Date;
    sessionId: string;
    testIds: string[];
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Row lock serializes concurrent claims on the same seat.
      await tx.$queryRaw`SELECT id FROM "session_participants" WHERE id = ${params.seatId}::uuid FOR UPDATE`;
      // Conditional lock: only win the seat if it is still unclaimed.
      const won = await tx.sessionParticipant.updateMany({
        where: { id: params.seatId, tokenHash: null },
        data: { tokenHash: params.tokenHash, claimedAt: params.claimedAt },
      });
      if (won.count === 0) return false;

      const existing = await tx.attempt.findMany({
        where: { participantId: params.seatId },
        select: { testId: true },
      });
      const have = new Set(existing.map((a) => a.testId));
      const missing = params.testIds.filter((t) => !have.has(t));
      if (missing.length > 0) {
        // The roster may already carry the birth date the norm needs; copying
        // it here saves the participant from being asked again in the runner.
        const seat = await tx.sessionParticipant.findUnique({
          where: { id: params.seatId },
          select: {
            institutionParticipant: { select: { birthDate: true } },
          },
        });
        const birthDate = seat?.institutionParticipant?.birthDate ?? null;
        await tx.attempt.createMany({
          data: missing.map((testId) => ({
            sessionId: params.sessionId,
            testId,
            participantId: params.seatId,
            status: 'IN_PROGRESS',
            birthDate,
          })),
        });
      }
      return true;
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
