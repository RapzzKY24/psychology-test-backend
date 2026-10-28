import 'dotenv/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaPsychologistStatsRepository } from '../repository/psychologist-stats.prisma-repository';
import { PsychologistStatsService } from '../service/psychologist-stats.service';
import { startOfWibDay, wibDayKey } from '../../../common/utils/wib';

/**
 * The daily series is the only piece of this feature that needs real SQL
 * (`AT TIME ZONE` bucketing), so it is checked against the dev database.
 */
describe('Psychologist stats (integration, DB real)', () => {
  const tag = `e2e-stats-${Date.now()}`;
  let prisma: PrismaService;
  let service: PsychologistStatsService;
  let userId: string;
  let testId: string;
  let sessionId: string;
  const attemptIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const user = await prisma.user.create({
      data: {
        id: `${tag}-psy`,
        name: 'Psikolog E2E',
        email: `${tag}@example.com`,
        role: 'PSYCHOLOGIST',
      },
    });
    userId = user.id;

    const test = await prisma.test.create({
      data: {
        slug: `${tag}-disc`,
        name: 'E2E DISC Stats',
        description: 'Fixture for the psychologist stats series',
        category: 'PERSONALITY',
        scorerType: 'FORCED_CHOICE_DISC',
        price: 100000,
        estimatedDurationMin: 10,
        status: 'PUBLISHED',
      },
    });
    testId = test.id;

    const session = await prisma.testSession.create({
      data: {
        title: `${tag} Sesi`,
        kind: 'INDIVIDUAL',
        token: `${tag}-token`,
        slotLimit: 3,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    sessionId = session.id;

    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 3600 * 1000);

    // One result today, still waiting in the queue.
    const fresh = await prisma.attempt.create({
      data: { sessionId, testId, userId, status: 'COMPLETED' },
    });
    await prisma.testResult.create({
      data: {
        attemptId: fresh.id,
        scores: {},
        patternCode: 'SC',
        status: 'PENDING_REVIEW',
        computedAt: now,
      },
    });

    // Two results three days ago, both decided by this psychologist.
    for (const status of ['APPROVED', 'RETURNED'] as const) {
      const attempt = await prisma.attempt.create({
        data: { sessionId, testId, userId, status: 'COMPLETED' },
      });
      await prisma.testResult.create({
        data: {
          attemptId: attempt.id,
          scores: {},
          patternCode: 'SC',
          status,
          computedAt: threeDaysAgo,
          reviewedById: userId,
          reviewedAt: new Date(now.getTime() - 24 * 3600 * 1000),
        },
      });
    }

    attemptIds.push(
      ...(
        await prisma.attempt.findMany({
          where: { sessionId },
          select: { id: true },
        })
      ).map((row) => row.id),
    );

    service = new PsychologistStatsService(
      new PrismaPsychologistStatsRepository(prisma),
    );
  });

  afterAll(async () => {
    await prisma.testResult.deleteMany({
      where: { attemptId: { in: attemptIds } },
    });
    await prisma.attempt.deleteMany({ where: { id: { in: attemptIds } } });
    await prisma.testSession.deleteMany({ where: { id: sessionId } });
    await prisma.test.deleteMany({ where: { id: testId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('buckets new results per WIB day and counts the personal decisions', async () => {
    const now = new Date();
    const result = await service.getReviewStats(userId, 7);

    const todayKey = wibDayKey(startOfWibDay(now, 0));
    const threeDaysAgoKey = wibDayKey(startOfWibDay(now, 3));

    expect(result.incoming).toHaveLength(7);
    expect(result.incoming.at(-1)).toEqual({ date: todayKey, count: 1 });
    expect(
      result.incoming.find((point) => point.date === threeDaysAgoKey)?.count,
    ).toBe(2);
    expect(result.mine).toEqual({ approved7d: 1, returned7d: 1 });
    expect(result.queueNow).toBeGreaterThanOrEqual(1);
  });
});
