import { PublicStatsService } from '../public-stats.service';

describe('PublicStatsService', () => {
  let service: PublicStatsService;
  let prisma: { test: { count: jest.Mock; findMany: jest.Mock } };
  let psychologists: { listPublic: jest.Mock };

  beforeEach(() => {
    prisma = { test: { count: jest.fn(), findMany: jest.fn() } };
    psychologists = { listPublic: jest.fn() };
    service = new PublicStatsService(prisma as never, psychologists as never);
  });

  it('should count only published tests', async () => {
    prisma.test.count.mockResolvedValue(27);
    prisma.test.findMany.mockResolvedValue([
      { category: 'COGNITIVE' },
      { category: 'PERSONALITY' },
      { category: 'WORK_STYLE' },
      { category: 'INTEREST' },
      { category: 'PROJECTIVE' },
    ]);
    psychologists.listPublic.mockResolvedValue([{ fullName: 'Ayu' }]);

    const stats = await service.getStats();

    expect(prisma.test.count).toHaveBeenCalledWith({
      where: { status: 'PUBLISHED' },
    });
    expect(stats).toEqual({ tests: 27, categories: 5, psychologists: 1 });
  });

  it('should count distinct categories, not published rows', async () => {
    prisma.test.count.mockResolvedValue(27);
    // The distinct flag lives in the query; the service reports the row count.
    prisma.test.findMany.mockResolvedValue([{ category: 'COGNITIVE' }]);
    psychologists.listPublic.mockResolvedValue([]);

    const stats = await service.getStats();

    expect(prisma.test.findMany).toHaveBeenCalledWith({
      where: { status: 'PUBLISHED' },
      select: { category: true },
      distinct: ['category'],
    });
    expect(stats.categories).toBe(1);
  });

  it('should report zero everywhere on an empty catalog', async () => {
    prisma.test.count.mockResolvedValue(0);
    prisma.test.findMany.mockResolvedValue([]);
    psychologists.listPublic.mockResolvedValue([]);

    await expect(service.getStats()).resolves.toEqual({
      tests: 0,
      categories: 0,
      psychologists: 0,
    });
  });
});
