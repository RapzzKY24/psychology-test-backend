import { Test } from '@nestjs/testing';
import { InstansiStatsService } from '../service/instansi-stats.service';
import { InstansiParticipantsService } from '../service/instansi-participants.service';
import { INSTANSI_STATS_REPOSITORY } from '../repository/instansi-stats.repository';
import type {
  InstansiStatsRepository,
  SessionProgressRow,
} from '../repository/instansi-stats.repository';
import type { AttemptStatus } from '../../../generated/prisma/client';

/** Plain jest mocks — `jest.Mocked<T>` keeps the interface methods, which the
 *  `unbound-method` lint rule rejects when they are passed to `expect`. */
type MockedRepo = { [K in keyof InstansiStatsRepository]: jest.Mock };
type MockedParticipants = { resolveInstitutionId: jest.Mock };

const INSTITUTION_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';

function sessionRow(
  participants: AttemptStatus[][],
  slotLimit = 20,
): SessionProgressRow {
  return {
    id: SESSION_ID,
    title: 'DISC — PT Contoh — Okt 2026',
    status: 'ACTIVE',
    slotLimit,
    participants: participants.map((attemptStatuses) => ({ attemptStatuses })),
  };
}

describe('InstansiStatsService', () => {
  let service: InstansiStatsService;
  let repo: MockedRepo;
  let participantsService: MockedParticipants;

  beforeEach(async () => {
    repo = { findSessionProgress: jest.fn() };
    participantsService = {
      resolveInstitutionId: jest.fn().mockResolvedValue(INSTITUTION_ID),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        InstansiStatsService,
        { provide: INSTANSI_STATS_REPOSITORY, useValue: repo },
        { provide: InstansiParticipantsService, useValue: participantsService },
      ],
    }).compile();
    service = moduleRef.get(InstansiStatsService);
  });

  it('should scope the query to the caller institution', async () => {
    repo.findSessionProgress.mockResolvedValue([]);

    await service.getProgress('user-1', 5);

    expect(participantsService.resolveInstitutionId).toHaveBeenCalledWith(
      'user-1',
    );
    expect(repo.findSessionProgress).toHaveBeenCalledWith({
      institutionId: INSTITUTION_ID,
      limit: 5,
    });
  });

  it('should classify every participant into exactly one bucket', async () => {
    repo.findSessionProgress.mockResolvedValue([
      sessionRow([
        ['COMPLETED'],
        ['COMPLETED', 'COMPLETED'],
        ['IN_PROGRESS'],
        ['COMPLETED', 'IN_PROGRESS'],
        ['ABANDONED'],
        [],
        [],
      ]),
    ]);

    const result = await service.getProgress('user-1', 5);

    expect(result.sessions[0]).toMatchObject({
      completed: 2,
      inProgress: 3,
      notStarted: 2,
      empty: 13,
    });
  });

  it('should report empty seats as slotLimit minus roster size', async () => {
    repo.findSessionProgress.mockResolvedValue([
      sessionRow([['COMPLETED'], ['COMPLETED']], 2),
    ]);

    const result = await service.getProgress('user-1', 5);

    expect(result.sessions[0]?.empty).toBe(0);
  });

  it('should never report negative empty seats when the roster overflows', async () => {
    repo.findSessionProgress.mockResolvedValue([sessionRow([[], [], []], 2)]);

    const result = await service.getProgress('user-1', 5);

    expect(result.sessions[0]?.empty).toBe(0);
    expect(result.sessions[0]?.notStarted).toBe(3);
  });

  it('should expose the session id, title and status for the chart labels', async () => {
    repo.findSessionProgress.mockResolvedValue([sessionRow([])]);

    const result = await service.getProgress('user-1', 5);

    expect(result.sessions[0]).toMatchObject({
      sessionId: SESSION_ID,
      title: 'DISC — PT Contoh — Okt 2026',
      status: 'ACTIVE',
      slotLimit: 20,
    });
  });
});
