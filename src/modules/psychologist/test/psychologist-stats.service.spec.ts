import { Test } from '@nestjs/testing';
import { PsychologistStatsService } from '../service/psychologist-stats.service';
import { PSYCHOLOGIST_STATS_REPOSITORY } from '../repository/psychologist-stats.repository';
import type { PsychologistStatsRepository } from '../repository/psychologist-stats.repository';

/** Plain jest mocks — `jest.Mocked<T>` keeps the interface methods, which the
 *  `unbound-method` lint rule rejects when they are passed to `expect`. */
type MockedRepo = { [K in keyof PsychologistStatsRepository]: jest.Mock };

// 2026-10-28T05:00:00Z === 2026-10-28 12:00 WIB.
const NOW = new Date('2026-10-28T05:00:00Z');
const PSYCHOLOGIST_ID = 'psych-1';

describe('PsychologistStatsService', () => {
  let service: PsychologistStatsService;
  let repo: MockedRepo;

  beforeEach(async () => {
    repo = {
      findIncomingByDay: jest.fn(),
      findOutcome: jest.fn(),
      countPending: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PsychologistStatsService,
        { provide: PSYCHOLOGIST_STATS_REPOSITORY, useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(PsychologistStatsService);
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return one point per day, oldest first, zero-filled', async () => {
    repo.findIncomingByDay.mockResolvedValue([
      { date: '2026-10-27', count: 4 },
    ]);
    repo.findOutcome.mockResolvedValue({ approved: 0, returned: 0 });
    repo.countPending.mockResolvedValue(0);

    const result = await service.getReviewStats(PSYCHOLOGIST_ID, 3);

    expect(result.incoming).toEqual([
      { date: '2026-10-26', count: 0 },
      { date: '2026-10-27', count: 4 },
      { date: '2026-10-28', count: 0 },
    ]);
  });

  it('should query the incoming series from the first day of the window, WIB', async () => {
    repo.findIncomingByDay.mockResolvedValue([]);
    repo.findOutcome.mockResolvedValue({ approved: 0, returned: 0 });
    repo.countPending.mockResolvedValue(0);

    await service.getReviewStats(PSYCHOLOGIST_ID, 14);

    expect(repo.findIncomingByDay).toHaveBeenCalledWith({
      since: new Date('2026-10-14T17:00:00.000Z'), // 2026-10-15 00:00 WIB
    });
  });

  it('should scope the outcome counters to the caller and the last 7 days', async () => {
    repo.findIncomingByDay.mockResolvedValue([]);
    repo.findOutcome.mockResolvedValue({ approved: 11, returned: 2 });
    repo.countPending.mockResolvedValue(7);

    const result = await service.getReviewStats(PSYCHOLOGIST_ID, 14);

    expect(repo.findOutcome).toHaveBeenCalledWith({
      psychologistId: PSYCHOLOGIST_ID,
      since: new Date('2026-10-21T17:00:00.000Z'), // 2026-10-22 00:00 WIB
    });
    expect(result.mine).toEqual({ approved7d: 11, returned7d: 2 });
    expect(result.queueNow).toBe(7);
  });

  it('should ignore incoming rows outside the requested window', async () => {
    repo.findIncomingByDay.mockResolvedValue([
      { date: '2026-01-01', count: 99 },
    ]);
    repo.findOutcome.mockResolvedValue({ approved: 0, returned: 0 });
    repo.countPending.mockResolvedValue(0);

    const result = await service.getReviewStats(PSYCHOLOGIST_ID, 1);

    expect(result.incoming).toEqual([{ date: '2026-10-28', count: 0 }]);
  });
});
