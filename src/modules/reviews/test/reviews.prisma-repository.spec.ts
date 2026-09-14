import { PrismaReviewsRepository } from '../repository/reviews.prisma-repository';

describe('PrismaReviewsRepository.listReviews — enriched fields', () => {
  const makePrisma = (results: unknown[], total = 1) =>
    ({
      testResult: {
        findMany: jest.fn().mockResolvedValue(results),
        count: jest.fn().mockResolvedValue(total),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    }) as never;

  it('should resolve institutionName as session / participant (hierarchy)', async () => {
    const mockPrisma = makePrisma([
      {
        id: 'r1',
        status: 'APPROVED',
        reviewNote: null,
        patternCode: 'DISC-D',
        scores: { graph: { D: 1 } },
        correctedPatternCode: null,
        correctedScores: null,
        attempt: {
          id: 'a1',
          completedAt: new Date(),
          userId: null,
          test: { name: 'DISC' },
          session: { title: 'Sesi 1', institution: { name: 'RS Harapan' } },
          participant: {
            name: 'Budi',
            email: 'budi@example.com',
            institutionParticipant: { institution: { name: 'Klinik A' } },
          },
        },
      },
    ]);
    const repo = new PrismaReviewsRepository(mockPrisma);
    const { data } = await repo.listReviews({
      where: { status: 'APPROVED' } as never,
      skip: 0,
      take: 10,
    });
    expect(data[0].institutionName).toBe('RS Harapan / Klinik A');
    expect(data[0].participantEmail).toBe('budi@example.com');
  });

  it('should fallback to participant institution when session has none (B2C personal → null)', async () => {
    const mockPrisma = makePrisma([
      {
        id: 'r2',
        status: 'APPROVED',
        reviewNote: null,
        patternCode: 'X',
        scores: {},
        correctedPatternCode: null,
        correctedScores: null,
        attempt: {
          id: 'a2',
          completedAt: null,
          userId: 'u1',
          test: { name: 'DISC' },
          session: { title: 'Sesi 1', institution: null },
          participant: null,
        },
      },
    ]);
    // B2C: need user lookup
    (
      mockPrisma as unknown as { user: { findMany: jest.Mock } }
    ).user.findMany.mockResolvedValue([{ id: 'u1', name: 'Budi' }]);
    const repo = new PrismaReviewsRepository(mockPrisma);
    const { data } = await repo.listReviews({
      where: {},
      skip: 0,
      take: 10,
    });
    expect(data[0].institutionName).toBeNull();
    expect(data[0].participantName).toBe('Budi');
  });

  it('should use correctedScores/correctedPatternCode when present (effective)', async () => {
    const mockPrisma = makePrisma([
      {
        id: 'r3',
        status: 'APPROVED',
        reviewNote: null,
        patternCode: 'ORIG',
        scores: { orig: 1 },
        correctedPatternCode: 'CORR',
        correctedScores: { corr: 2 },
        attempt: {
          id: 'a3',
          completedAt: new Date(),
          userId: null,
          test: { name: 'DISC' },
          session: { title: 'S', institution: null },
          participant: { name: 'A', email: null, institutionParticipant: null },
        },
      },
    ]);
    const repo = new PrismaReviewsRepository(mockPrisma);
    const { data } = await repo.listReviews({
      where: {},
      skip: 0,
      take: 10,
    });
    expect(data[0].scores).toEqual({ corr: 2 });
    expect(data[0].patternCode).toBe('CORR');
  });

  it('should fallback scores/pattern to original when corrected is null', async () => {
    const mockPrisma = makePrisma([
      {
        id: 'r4',
        status: 'PENDING_REVIEW',
        reviewNote: null,
        patternCode: 'ORIG',
        scores: { orig: 1 },
        correctedPatternCode: null,
        correctedScores: null,
        attempt: {
          id: 'a4',
          completedAt: new Date(),
          userId: null,
          test: { name: 'T' },
          session: { title: 'S', institution: null },
          participant: { name: 'A', email: null, institutionParticipant: null },
        },
      },
    ]);
    const repo = new PrismaReviewsRepository(mockPrisma);
    const { data } = await repo.listReviews({
      where: {},
      skip: 0,
      take: 10,
    });
    expect(data[0].scores).toEqual({ orig: 1 });
    expect(data[0].patternCode).toBe('ORIG');
  });
});
