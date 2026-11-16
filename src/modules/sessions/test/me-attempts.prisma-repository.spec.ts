import { PrismaAttemptsRepository } from '../repository/attempts.prisma-repository';
import type { PrismaService } from '../../../prisma/prisma.service';

/**
 * The history tab filters by a stage the participant can name, while the
 * database stores an attempt status plus a result status. This locks the
 * mapping so the two cannot drift apart silently.
 */
describe('PrismaAttemptsRepository — listByUser stage filter', () => {
  let repo: PrismaAttemptsRepository;
  let prisma: {
    attempt: { findMany: jest.Mock; count: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      attempt: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    repo = new PrismaAttemptsRepository(prisma as unknown as PrismaService);
  });

  function whereOf(call: jest.Mock): Record<string, unknown> {
    const calls = call.mock.calls as [{ where: Record<string, unknown> }][];
    return calls[0][0].where;
  }

  it('shows every non-abandoned attempt when no stage is picked', async () => {
    await repo.listByUser({ userId: 'u1', skip: 0, take: 10 });

    expect(whereOf(prisma.attempt.findMany)).toEqual({
      userId: 'u1',
      status: { not: 'ABANDONED' },
    });
  });

  it('maps "dikerjakan" to an in-progress attempt', async () => {
    await repo.listByUser({
      userId: 'u1',
      skip: 0,
      take: 10,
      stage: 'IN_PROGRESS',
    });

    expect(whereOf(prisma.attempt.findMany)).toMatchObject({
      status: 'IN_PROGRESS',
    });
  });

  it('maps "menunggu review" to a completed attempt with a pending result', async () => {
    await repo.listByUser({
      userId: 'u1',
      skip: 0,
      take: 10,
      stage: 'AWAITING_REVIEW',
    });

    expect(whereOf(prisma.attempt.findMany)).toMatchObject({
      status: 'COMPLETED',
      result: { status: 'PENDING_REVIEW' },
    });
  });

  it('maps "hasil terbit" to an approved result', async () => {
    await repo.listByUser({
      userId: 'u1',
      skip: 0,
      take: 10,
      stage: 'APPROVED',
    });

    expect(whereOf(prisma.attempt.findMany)).toMatchObject({
      status: 'COMPLETED',
      result: { status: 'APPROVED' },
    });
  });

  it('maps "dikembalikan" to a returned result', async () => {
    await repo.listByUser({
      userId: 'u1',
      skip: 0,
      take: 10,
      stage: 'RETURNED',
    });

    expect(whereOf(prisma.attempt.findMany)).toMatchObject({
      status: 'COMPLETED',
      result: { status: 'RETURNED' },
    });
  });

  it('counts with the same filter it lists with', async () => {
    await repo.listByUser({
      userId: 'u1',
      skip: 0,
      take: 10,
      stage: 'APPROVED',
    });

    expect(whereOf(prisma.attempt.count)).toEqual(
      whereOf(prisma.attempt.findMany),
    );
  });

  it('orders newest first with the id as the tie-breaker', async () => {
    await repo.listByUser({ userId: 'u1', skip: 0, take: 10 });

    expect(prisma.attempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('carries the review note into the row', async () => {
    prisma.attempt.findMany.mockResolvedValue([
      {
        id: 'a1',
        testId: 't1',
        status: 'COMPLETED',
        startedAt: new Date('2026-11-16T08:00:00Z'),
        completedAt: new Date('2026-11-16T09:00:00Z'),
        sessionId: 's1',
        test: { name: 'DISC Form A' },
        session: { title: 'Order abc' },
        result: {
          status: 'RETURNED',
          reviewNote: 'Ulangi bagian 2',
        },
      },
      {
        id: 'a2',
        testId: 't2',
        status: 'IN_PROGRESS',
        startedAt: new Date('2026-11-15T08:00:00Z'),
        completedAt: null,
        sessionId: 's2',
        test: { name: 'IST' },
        session: { title: 'Order def' },
        result: null,
      },
    ]);

    const { data } = await repo.listByUser({ userId: 'u1', skip: 0, take: 10 });

    expect(data[0]).toMatchObject({
      resultStatus: 'RETURNED',
      reviewNote: 'Ulangi bagian 2',
    });
    expect(data[1]).toMatchObject({
      resultStatus: null,
      reviewNote: null,
    });
  });
});
