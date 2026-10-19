/* eslint-disable @typescript-eslint/unbound-method */
import { InstansiOverviewService } from '../service/instansi-overview.service';
import type { SessionsRepository } from '../../sessions/repository/sessions.repository';
import type { InstansiParticipantsRepository } from '../repository/instansi-participants.repository';

describe('InstansiOverviewService', () => {
  let service: InstansiOverviewService;
  let mockSessionsRepo: jest.Mocked<SessionsRepository>;
  let mockParticipantsRepo: jest.Mocked<InstansiParticipantsRepository>;
  let mockParticipantsService: { resolveInstitutionId: jest.Mock };

  beforeEach(() => {
    mockSessionsRepo = {
      findById: jest.fn(),
      findDetailById: jest.fn(),
      findMany: jest.fn(),
      findManyByInstitution: jest.fn(),
      countSessionsByInstitution: jest.fn(),
      getAttemptStatsByInstitution: jest.fn(),
      findByToken: jest.fn(),
      findTestsByIds: jest.fn(),
      findInstitutionById: jest.fn(),
      createWithTests: jest.fn(),
      updateStatus: jest.fn(),
      update: jest.fn(),
      findSessionTestsBySessionId: jest.fn(),
      findParticipantByTokenHash: jest.fn(),
      findParticipantsBySessionId: jest.fn(),
      findAttemptsByParticipantId: jest.fn(),
      countResponsesByParticipantId: jest.fn(),
      countParticipants: jest.fn(),
      updateParticipantToken: jest.fn(),
      claimSeatWithAttempts: jest.fn(),
      joinSession: jest.fn(),
      createParticipants: jest.fn(),
      updateParticipant: jest.fn(),
      deleteParticipant: jest.fn(),
      resetParticipantToken: jest.fn(),
    };
    mockParticipantsRepo = {
      findMany: jest.fn(),
      findById: jest.fn(),
      findManyByIds: jest.fn(),
      findByIdNumber: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    mockParticipantsService = { resolveInstitutionId: jest.fn() };
    mockParticipantsService.resolveInstitutionId.mockResolvedValue('inst-1');
    service = new InstansiOverviewService(
      mockSessionsRepo,
      mockParticipantsRepo,
      mockParticipantsService as never,
    );
  });

  it('aggregates employees, sessions, and attempts for the caller institution', async () => {
    mockParticipantsRepo.findMany.mockResolvedValue({
      data: [],
      total: 5,
    });
    mockSessionsRepo.countSessionsByInstitution.mockResolvedValue(2);
    mockSessionsRepo.getAttemptStatsByInstitution.mockResolvedValue({
      total: 10,
      inProgress: 3,
      completed: 7,
    });

    const result = await service.getOverview('user-1');

    expect(result).toEqual({
      employees: 5,
      sessions: 2,
      attempts: { total: 10, inProgress: 3, completed: 7 },
    });
    expect(mockSessionsRepo.countSessionsByInstitution).toHaveBeenCalledWith(
      'inst-1',
    );
    expect(mockSessionsRepo.getAttemptStatsByInstitution).toHaveBeenCalledWith(
      'inst-1',
    );
  });
});
