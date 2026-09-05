import { MeAttemptsService } from '../service/me-attempts.service';
import type { AttemptsRepository } from '../repository/attempts.repository';

describe('MeAttemptsService', () => {
  let service: MeAttemptsService;
  let mockRepo: jest.Mocked<Pick<AttemptsRepository, 'listByUser'>>;

  beforeEach(() => {
    mockRepo = { listByUser: jest.fn() };
    service = new MeAttemptsService(mockRepo as unknown as AttemptsRepository);
  });

  it('returns own attempts in any status with pagination meta', async () => {
    mockRepo.listByUser.mockResolvedValue({
      data: [
        {
          id: 'a1',
          testId: 't1',
          testName: 'DISC Form A',
          status: 'COMPLETED',
          startedAt: new Date('2026-09-01T01:00:00Z'),
          completedAt: new Date('2026-09-01T02:00:00Z'),
          sessionId: 's1',
          sessionTitle: 'Sesi Individual',
          resultStatus: 'PENDING_REVIEW',
        },
        {
          id: 'a2',
          testId: 't2',
          testName: 'DISC Form B',
          status: 'IN_PROGRESS',
          startedAt: new Date('2026-09-02T01:00:00Z'),
          completedAt: null,
          sessionId: 's1',
          sessionTitle: 'Sesi Individual',
          resultStatus: null,
        },
      ],
      total: 12,
    });

    const result = await service.list('user-1', { page: 2, limit: 10 });

    expect(mockRepo.listByUser).toHaveBeenCalledWith({
      userId: 'user-1',
      skip: 10,
      take: 10,
    });
    expect(result.data).toHaveLength(2);
    expect(result.data[0]?.resultStatus).toBe('PENDING_REVIEW');
    expect(result.data[1]?.resultStatus).toBeNull();
    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 12,
      totalPages: 2,
    });
  });

  it('starts at page 1 with zero offset', async () => {
    mockRepo.listByUser.mockResolvedValue({ data: [], total: 0 });

    const result = await service.list('user-1', { page: 1, limit: 10 });

    expect(mockRepo.listByUser).toHaveBeenCalledWith({
      userId: 'user-1',
      skip: 0,
      take: 10,
    });
    expect(result.data).toEqual([]);
    expect(result.meta).toEqual({
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
    });
  });
});
