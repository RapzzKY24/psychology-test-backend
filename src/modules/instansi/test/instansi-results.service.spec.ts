import { InstansiResultsService } from '../service/instansi-results.service';
import type { ResultsRepository } from '../../results/repository/results.repository';

describe('InstansiResultsService', () => {
  let service: InstansiResultsService;
  let mockRepo: { listApprovedByInstitution: jest.Mock };
  let mockParticipantsService: { resolveInstitutionId: jest.Mock };

  const USER_ID = 'user-1';
  const INSTITUTION_ID = 'inst-1';

  beforeEach(() => {
    mockRepo = { listApprovedByInstitution: jest.fn() };
    mockParticipantsService = { resolveInstitutionId: jest.fn() };
    mockParticipantsService.resolveInstitutionId.mockResolvedValue(
      INSTITUTION_ID,
    );
    service = new InstansiResultsService(
      mockRepo as unknown as ResultsRepository,
      mockParticipantsService as unknown as never,
    );
  });

  it('scopes the query to the caller institution and paginates', async () => {
    mockRepo.listApprovedByInstitution.mockResolvedValue({
      data: [
        {
          resultId: 'r1',
          attemptId: 'a1',
          participantName: 'Budi',
          testName: 'DISC',
          patternCode: 'SC',
          scores: { D: 1 },
          approvedAt: new Date('2026-09-01T02:00:00Z'),
        },
      ],
      total: 3,
    });

    const result = await service.list(USER_ID, { page: 1, limit: 2 });

    expect(mockRepo.listApprovedByInstitution).toHaveBeenCalledWith({
      institutionId: INSTITUTION_ID,
      skip: 0,
      take: 2,
    });
    expect(result.meta).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
    expect(result.data[0]).toEqual({
      resultId: 'r1',
      participantName: 'Budi',
      testName: 'DISC',
      patternCode: 'SC',
      scores: { D: 1 },
      approvedAt: new Date('2026-09-01T02:00:00Z'),
    });
  });

  it('applies skip for later pages', async () => {
    mockRepo.listApprovedByInstitution.mockResolvedValue({
      data: [],
      total: 3,
    });

    await service.list(USER_ID, { page: 3, limit: 10 });

    expect(mockRepo.listApprovedByInstitution).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });
});
