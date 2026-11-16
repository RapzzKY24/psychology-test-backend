import { PrismaMeProfileRepository } from '../repository/me-profile.prisma-repository';
import type { PrismaService } from '../../../prisma/prisma.service';

describe('PrismaMeProfileRepository', () => {
  let repo: PrismaMeProfileRepository;
  let prisma: {
    user: { findUnique: jest.Mock; updateMany: jest.Mock };
    attempt: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), updateMany: jest.fn() },
      attempt: { findFirst: jest.fn() },
    };
    repo = new PrismaMeProfileRepository(prisma as unknown as PrismaService);
  });

  it('reads the latest attempt so the profile can show its declarations', async () => {
    prisma.user.findUnique.mockResolvedValue({
      name: 'Budi',
      email: 'budi@example.com',
      phone: null,
    });
    prisma.attempt.findFirst.mockResolvedValue({
      startedAt: new Date('2026-11-10T09:00:00Z'),
      birthDate: new Date('2000-01-01T00:00:00Z'),
      gender: 'MALE',
      education: 'S1',
      test: { name: 'DISC Form A' },
    });

    const profile = await repo.find('u1');

    expect(prisma.attempt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(profile).toEqual({
      name: 'Budi',
      email: 'budi@example.com',
      phone: null,
      lastAttempt: {
        testName: 'DISC Form A',
        startedAt: new Date('2026-11-10T09:00:00Z'),
        birthDate: new Date('2000-01-01T00:00:00Z'),
        gender: 'MALE',
        education: 'S1',
      },
    });
  });

  it('has no last attempt before the first test', async () => {
    prisma.user.findUnique.mockResolvedValue({
      name: 'Budi',
      email: 'budi@example.com',
      phone: '0812',
    });
    prisma.attempt.findFirst.mockResolvedValue(null);

    await expect(repo.find('u1')).resolves.toMatchObject({ lastAttempt: null });
  });

  it('returns null when the user row is gone', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(repo.find('u1')).resolves.toBeNull();
    expect(prisma.attempt.findFirst).not.toHaveBeenCalled();
  });

  it('reports whether the update touched a row', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(repo.update('u1', { name: 'Budi S.' })).resolves.toBe(false);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { name: 'Budi S.' },
    });
  });
});
