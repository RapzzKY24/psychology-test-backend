import { PrismaMeOverviewRepository } from '../repository/me-overview.prisma-repository';
import type { PrismaService } from '../../../prisma/prisma.service';

describe('PrismaMeOverviewRepository', () => {
  let repo: PrismaMeOverviewRepository;
  let prisma: {
    attempt: { count: jest.Mock; findMany: jest.Mock };
    testResult: { count: jest.Mock; findMany: jest.Mock };
    certificate: { count: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      attempt: { count: jest.fn(), findMany: jest.fn() },
      testResult: { count: jest.fn(), findMany: jest.fn() },
      certificate: { count: jest.fn(), findMany: jest.fn() },
    };
    repo = new PrismaMeOverviewRepository(prisma as unknown as PrismaService);
  });

  it('counts every state against the caller only', async () => {
    prisma.attempt.count.mockResolvedValue(2);
    prisma.testResult.count.mockResolvedValue(1);
    prisma.certificate.count.mockResolvedValue(3);
    prisma.attempt.findMany.mockResolvedValue([]);
    prisma.testResult.findMany.mockResolvedValue([]);
    prisma.certificate.findMany.mockResolvedValue([]);

    const data = await repo.forUser('u1');

    expect(prisma.attempt.count).toHaveBeenCalledWith({
      where: { userId: 'u1', status: 'IN_PROGRESS' },
    });
    expect(prisma.testResult.count).toHaveBeenCalledWith({
      where: { status: 'PENDING_REVIEW', attempt: { userId: 'u1' } },
    });
    expect(prisma.testResult.count).toHaveBeenCalledWith({
      where: { status: 'APPROVED', attempt: { userId: 'u1' } },
    });
    expect(prisma.certificate.count).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        number: { not: null },
        issuedAt: { not: null },
        result: { attempt: { userId: 'u1' } },
      },
    });
    expect(data.counts).toEqual({
      inProgress: 2,
      awaitingReview: 1,
      resultsReady: 1,
      certificatesReady: 3,
    });
  });

  it('asks for three rows per list, newest first', async () => {
    prisma.attempt.findMany.mockResolvedValue([]);
    prisma.testResult.findMany.mockResolvedValue([]);
    prisma.certificate.findMany.mockResolvedValue([]);

    await repo.forUser('u1');

    expect(prisma.attempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', status: 'IN_PROGRESS' },
        orderBy: { startedAt: 'desc' },
        take: 3,
      }),
    );
    expect(prisma.testResult.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'APPROVED', attempt: { userId: 'u1' } },
        orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
        take: 3,
      }),
    );
    expect(prisma.certificate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        take: 3,
      }),
    );
  });

  it('flattens the test name out of the nested rows', async () => {
    prisma.attempt.count.mockResolvedValue(1);
    prisma.testResult.count.mockResolvedValue(1);
    prisma.certificate.count.mockResolvedValue(1);
    prisma.attempt.findMany.mockResolvedValue([
      {
        id: 'att-1',
        startedAt: new Date('2026-11-14T09:00:00Z'),
        test: { name: 'DISC Form A' },
      },
    ]);
    prisma.testResult.findMany.mockResolvedValue([
      {
        attemptId: 'att-2',
        patternCode: 'D',
        reviewedAt: new Date('2026-11-16T08:00:00Z'),
        attempt: { test: { name: '16PF' } },
      },
    ]);
    prisma.certificate.findMany.mockResolvedValue([
      {
        id: 'cert-1',
        number: '012/DISC/XI/2026',
        issuedAt: new Date('2026-11-16T09:00:00Z'),
        result: { attempt: { test: { name: 'DISC Form A' } } },
      },
    ]);

    const data = await repo.forUser('u1');

    expect(data.activeAttempts).toEqual([
      {
        attemptId: 'att-1',
        testName: 'DISC Form A',
        startedAt: new Date('2026-11-14T09:00:00Z'),
      },
    ]);
    expect(data.latestResults).toEqual([
      {
        attemptId: 'att-2',
        testName: '16PF',
        patternCode: 'D',
        approvedAt: new Date('2026-11-16T08:00:00Z'),
      },
    ]);
    expect(data.latestCertificates).toEqual([
      {
        id: 'cert-1',
        number: '012/DISC/XI/2026',
        testName: 'DISC Form A',
        issuedAt: new Date('2026-11-16T09:00:00Z'),
      },
    ]);
  });
});
