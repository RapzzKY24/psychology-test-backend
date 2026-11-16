import { ConflictException } from '@nestjs/common';
import { PrismaAttemptsRepository } from '../repository/attempts.prisma-repository';

describe('expired attempt recovery', () => {
  const now = Date.now();
  const old = {
    id: 'old-id',
    status: 'IN_PROGRESS',
    startedAt: new Date(now - 120_000),
    sessionId: 'session-id',
    testId: 'test-id',
    userId: null,
    participantId: 'participant-id',
    birthDate: null,
    gender: null,
    education: null,
    test: { timeLimitMin: 1 },
    session: { status: 'ACTIVE', joinMode: 'ROSTER', expiresAt: new Date(now + 60_000) },
    result: null,
  };

  it('preserves the expired attempt and creates its replacement in one transaction', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      attempt: {
        findUnique: jest.fn().mockResolvedValue(old),
        update: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'new-id' }),
      },
      sessionParticipant: { update: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const repo = new PrismaAttemptsRepository(prisma as never);

    await expect(repo.resetExpiredAttempt(old.id)).resolves.toEqual({
      oldAttemptId: old.id,
      newAttemptId: 'new-id',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.attempt.update).toHaveBeenCalledWith({
      where: { id: old.id }, data: { status: 'ABANDONED' },
    });
    expect(tx.attempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ participantId: old.participantId, status: 'IN_PROGRESS' }),
    });
    expect(tx.sessionParticipant.update).toHaveBeenCalledWith({
      where: { id: old.participantId }, data: { tokenHash: null },
    });
  });

  it('refuses a second reset after the first marked the attempt abandoned', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      attempt: { findUnique: jest.fn().mockResolvedValue({ ...old, status: 'ABANDONED' }) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const repo = new PrismaAttemptsRepository(prisma as never);
    await expect(repo.resetExpiredAttempt(old.id)).rejects.toThrow(ConflictException);
  });
});
