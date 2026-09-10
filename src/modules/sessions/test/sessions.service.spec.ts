/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method */
jest.mock('../utils/hash-pin', () => ({
  hashPin: jest.fn().mockResolvedValue('hashed-pin'),
}));

jest.mock('../utils/verify-pin', () => ({
  verifyPin: jest.fn(),
}));

import { SessionsService } from '../service/sessions.service';
import type { SessionsRepository } from '../repository/sessions.repository';
import { hashPin } from '../utils/hash-pin';
import { verifyPin } from '../utils/verify-pin';

describe('SessionsService', () => {
  let service: SessionsService;
  let mockRepo: jest.Mocked<SessionsRepository>;

  const adminId = '00000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    mockRepo = {
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
      findSessionTestsBySessionId: jest.fn(),
      findParticipantByTokenHash: jest.fn(),
      findParticipantsBySessionId: jest.fn(),
      countResponsesByParticipantId: jest.fn(),
      countParticipants: jest.fn(),
      findAttemptsByParticipantId: jest.fn(),
      updateParticipantToken: jest.fn(),
      claimSeatWithAttempts: jest.fn(),
      joinSession: jest.fn(),
    };
    mockRepo.findByToken.mockResolvedValue(null); // no token collision by default
    service = new SessionsService(mockRepo);
  });

  describe('create', () => {
    const baseDto = {
      title: 'Batch Rekrutmen September',
      testIds: ['11111111-1111-4111-8111-111111111111'],
      slotLimit: 30,
      expiresAt: new Date('2026-12-31T23:59:59.000Z'),
    };

    it('should reject with 422 validation_failed when a test is missing or not PUBLISHED', async () => {
      mockRepo.findTestsByIds.mockResolvedValue([
        { id: '11111111-1111-4111-8111-111111111111', status: 'DRAFT' },
      ]);
      await expect(service.create(baseDto, adminId)).rejects.toThrow(
        'validation_failed',
      );
    });

    it('should reject with 422 validation_failed when institutionId does not exist', async () => {
      mockRepo.findTestsByIds.mockResolvedValue([
        { id: '11111111-1111-4111-8111-111111111111', status: 'PUBLISHED' },
      ]);
      mockRepo.findInstitutionById.mockResolvedValue(null);
      await expect(
        service.create(
          { ...baseDto, institutionId: '22222222-2222-4222-8222-222222222222' },
          adminId,
        ),
      ).rejects.toThrow('validation_failed');
    });

    it('should create a GROUP session with 32-char token, ordered tests, and no pinHash when pin omitted', async () => {
      mockRepo.findTestsByIds.mockResolvedValue([
        { id: '11111111-1111-4111-8111-111111111111', status: 'PUBLISHED' },
      ]);
      mockRepo.createWithTests.mockResolvedValue({
        id: 'sess-1',
        kind: 'GROUP',
        status: 'ACTIVE',
      } as any);

      const result = await service.create(baseDto, adminId);

      expect(result).toEqual({ id: 'sess-1', kind: 'GROUP', status: 'ACTIVE' });
      expect(mockRepo.createWithTests).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Batch Rekrutmen September',
          kind: 'GROUP',
          createdById: adminId,
          pinHash: undefined,
          slotLimit: 30,
          tests: [
            {
              testId: '11111111-1111-4111-8111-111111111111',
              order: 1,
            },
          ],
        }),
      );
      const callArg = mockRepo.createWithTests.mock.calls[0][0];
      expect(callArg.token).toHaveLength(32);
      expect(callArg.token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should hash the pin (never store plain pin)', async () => {
      mockRepo.findTestsByIds.mockResolvedValue([
        { id: '11111111-1111-4111-8111-111111111111', status: 'PUBLISHED' },
      ]);
      mockRepo.createWithTests.mockResolvedValue({ id: 'sess-2' } as any);

      await service.create({ ...baseDto, pin: '1234' }, adminId);

      expect(hashPin).toHaveBeenCalledWith('1234');
      expect(mockRepo.createWithTests).toHaveBeenCalledWith(
        expect.objectContaining({ pinHash: 'hashed-pin' }),
      );
    });
  });

  describe('findDetail', () => {
    it('should throw 404 when session missing', async () => {
      mockRepo.findDetailById.mockResolvedValue(null);
      await expect(service.findDetail('missing')).rejects.toThrow(
        'Session not found',
      );
    });

    it('should return session detail with progress', async () => {
      const detail = {
        session: { id: 'sess-1' } as any,
        tests: [],
        participants: [],
        attempts: { total: 6, inProgress: 2, completed: 4 },
      };
      mockRepo.findDetailById.mockResolvedValue(detail);
      const result = await service.findDetail('sess-1');
      expect(result).toEqual(detail);
    });
  });

  describe('findMany', () => {
    it('should return PaginatedResponse with full meta', async () => {
      mockRepo.findMany.mockResolvedValue({
        data: [{ id: 'sess-1' } as any],
        total: 11,
      });
      const result = await service.findMany({ page: 1, limit: 10 });
      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        total: 11,
        totalPages: 2,
      });
    });
  });

  describe('close', () => {
    it('should throw 404 when session missing', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.close('missing')).rejects.toThrow(
        'Session not found',
      );
    });

    it('should be idempotent: already CLOSED returns session without update', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'sess-1',
        status: 'CLOSED',
      } as any);
      const result = await service.close('sess-1');
      expect(result.status).toBe('CLOSED');
      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('should set ACTIVE → CLOSED', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'sess-1',
        status: 'ACTIVE',
      } as any);
      mockRepo.updateStatus.mockResolvedValue({
        id: 'sess-1',
        status: 'CLOSED',
      } as any);
      const result = await service.close('sess-1');
      expect(result.status).toBe('CLOSED');
      expect(mockRepo.updateStatus).toHaveBeenCalledWith('sess-1', 'CLOSED');
    });
  });

  describe('join', () => {
    beforeEach(() => {
      mockRepo.findParticipantsBySessionId.mockResolvedValue([]);
      mockRepo.countResponsesByParticipantId.mockResolvedValue(0);
    });

    const future = new Date(Date.now() + 60 * 60 * 1000);
    const activeSession = {
      id: 'sess-1',
      status: 'ACTIVE',
      expiresAt: future,
      pinHash: null,
      slotLimit: 30,
    } as any;
    const publishedTests = [
      { testId: 't-1', testName: 'DISC', testStatus: 'PUBLISHED', order: 1 },
    ];
    const joinResult = {
      participant: { id: 'p-1' } as any,
      participantToken: 'a'.repeat(64),
      attempts: [{ id: 'a-1', testId: 't-1', testName: 'DISC' }],
      resumed: false,
    };

    it('should throw 404 when invite token is unknown', async () => {
      mockRepo.findByToken.mockResolvedValue(null);
      await expect(
        service.join('bad-token', { name: 'Budi' } as any, '1.1.1.1'),
      ).rejects.toThrow('Session not found');
    });

    it('should throw 410 session_closed when session is CLOSED', async () => {
      mockRepo.findByToken.mockResolvedValue({
        ...activeSession,
        status: 'CLOSED',
      });
      await expect(
        service.join('tok', { name: 'Budi' } as any, '1.1.1.1'),
      ).rejects.toThrow('session_closed');
    });

    it('should throw 410 session_expired when expiresAt is in the past', async () => {
      mockRepo.findByToken.mockResolvedValue({
        ...activeSession,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        service.join('tok', { name: 'Budi' } as any, '1.1.1.1'),
      ).rejects.toThrow('session_expired');
    });

    it('should throw 409 session_roster_only when joining a ROSTER session', async () => {
      mockRepo.findByToken.mockResolvedValue({
        ...activeSession,
        joinMode: 'ROSTER',
      });
      await expect(
        service.join('tok', { name: 'Budi' } as any, '1.1.1.1'),
      ).rejects.toThrow('session_roster_only');
    });

    it('should throw 410 test_archived when a session test is not PUBLISHED', async () => {
      mockRepo.findByToken.mockResolvedValue(activeSession);
      mockRepo.findSessionTestsBySessionId.mockResolvedValue([
        { testId: 't-1', testName: 'DISC', testStatus: 'ARCHIVED', order: 1 },
      ]);
      await expect(
        service.join('tok', { name: 'Budi' } as any, '1.1.1.1'),
      ).rejects.toThrow('test_archived');
    });

    it('should throw 401 invalid_pin when pin is required but missing', async () => {
      mockRepo.findByToken.mockResolvedValue({
        ...activeSession,
        pinHash: 'stored-hash',
      });
      mockRepo.findSessionTestsBySessionId.mockResolvedValue(publishedTests);
      jest.mocked(verifyPin).mockResolvedValue(false);
      await expect(
        service.join('tok', { name: 'Budi' } as any, '1.1.1.1'),
      ).rejects.toThrow('invalid_pin');
    });

    it('should throw 401 invalid_pin when pin is wrong', async () => {
      mockRepo.findByToken.mockResolvedValue({
        ...activeSession,
        pinHash: 'stored-hash',
      });
      mockRepo.findSessionTestsBySessionId.mockResolvedValue(publishedTests);
      jest.mocked(verifyPin).mockResolvedValue(false);
      await expect(
        service.join('tok', { name: 'Budi', pin: '0000' } as any, '1.1.1.1'),
      ).rejects.toThrow('invalid_pin');
      expect(verifyPin).toHaveBeenCalledWith('0000', 'stored-hash');
    });

    it('should create participant + one attempt per session test and return the one-time token', async () => {
      mockRepo.findByToken.mockResolvedValue(activeSession);
      mockRepo.findSessionTestsBySessionId.mockResolvedValue(publishedTests);
      mockRepo.joinSession.mockResolvedValue(joinResult);

      const result = await service.join(
        'tok',
        { name: 'Budi', email: 'budi@mail.com', candidateNumber: '007' },
        '1.1.1.1',
      );

      expect(result.participantToken).toMatch(/^[0-9a-f]{64}$/); // 32-byte hex
      expect(mockRepo.joinSession).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'sess-1',
          name: 'Budi',
          email: 'budi@mail.com',
          candidateNumber: '007',
          tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      );
      expect(result.attempts).toEqual([
        { id: 'a-1', testId: 't-1', testName: 'DISC' },
      ]);
    });

    it('should throw 429 too_many_requests on the 11th join from the same ip within a minute', async () => {
      mockRepo.findByToken.mockResolvedValue(activeSession);
      mockRepo.findSessionTestsBySessionId.mockResolvedValue(publishedTests);
      mockRepo.joinSession.mockResolvedValue(joinResult);

      for (let i = 0; i < 10; i++) {
        await service.join('tok', { name: `Budi ${i}` }, '1.1.1.1');
      }
      await expect(
        service.join('tok', { name: 'Budi 11' } as any, '1.1.1.1'),
      ).rejects.toThrow('too_many_requests');
      // different ip is not affected
      await expect(
        service.join('tok', { name: 'Sari' } as any, '2.2.2.2'),
      ).resolves.toEqual(joinResult);
    });
  });
});

describe('join — idempotent identity (owner decision 2026-09-06)', () => {
  let service: SessionsService;
  let mockRepo: jest.Mocked<SessionsRepository>;

  const baseSession = {
    id: 's1',
    title: 'Sesi Uji',
    status: 'ACTIVE',
    expiresAt: new Date('2099-01-01T00:00:00Z'),
    slotLimit: 20,
    pinHash: null,
  };

  beforeEach(() => {
    mockRepo = {
      findByToken: jest.fn(),
      findSessionTestsBySessionId: jest.fn(),
      findParticipantsBySessionId: jest.fn(),
      findAttemptsByParticipantId: jest.fn(),
      updateParticipantToken: jest.fn(),
      claimSeatWithAttempts: jest.fn(),
      countResponsesByParticipantId: jest.fn().mockResolvedValue(0),
      joinSession: jest.fn(),
    } as unknown as jest.Mocked<SessionsRepository>;
    service = new SessionsService(mockRepo);
  });

  it('auto-resumes on strong identity match (email), no duplicate create', async () => {
    mockRepo.findByToken.mockResolvedValue(baseSession as never);
    mockRepo.findParticipantsBySessionId.mockResolvedValue([
      {
        id: 'p1',
        name: 'RapzzKY',
        email: 'kid@mail.com',
        candidateNumber: null,
        tokenHash: 'old',
      } as never,
    ]);
    mockRepo.findAttemptsByParticipantId.mockResolvedValue([
      {
        id: 'a1',
        testId: 't1',
        testName: 'DISC Form A',
        startedAt: new Date(),
      },
    ]);

    const result = await service.join(
      'token-abc',
      { name: 'RapzzKY', email: 'kid@mail.com' },
      '1.1.1.1',
    );

    expect(mockRepo.joinSession).not.toHaveBeenCalled();
    expect(mockRepo.updateParticipantToken).toHaveBeenCalledWith(
      'p1',
      expect.any(String),
      expect.any(Date),
    );
    expect(result.resumed).toBe(true);
    expect(result.attempts).toHaveLength(1);
  });

  it('returns needs_confirmation for a name-only match (never silent-merges)', async () => {
    mockRepo.findByToken.mockResolvedValue(baseSession as never);
    mockRepo.findParticipantsBySessionId.mockResolvedValue([
      {
        id: 'p1',
        name: 'RapzzKY',
        email: null,
        candidateNumber: null,
        tokenHash: 'old',
      } as never,
    ]);

    const result = await service.join(
      'token-abc',
      { name: 'RapzzKY' },
      '1.1.1.1',
    );

    expect(mockRepo.joinSession).not.toHaveBeenCalled();
    expect(mockRepo.updateParticipantToken).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'needs_confirmation',
      matches: [
        { id: 'p1', name: 'RapzzKY', startedAt: null, answeredCount: 0 },
      ],
    });
  });

  it('resumes via confirmParticipantId after the FE confirmation step', async () => {
    mockRepo.findByToken.mockResolvedValue(baseSession as never);
    mockRepo.findParticipantsBySessionId.mockResolvedValue([
      {
        id: 'p1',
        name: 'RapzzKY',
        email: null,
        candidateNumber: null,
        tokenHash: 'old',
      } as never,
    ]);
    mockRepo.findAttemptsByParticipantId.mockResolvedValue([
      {
        id: 'a1',
        testId: 't1',
        testName: 'DISC Form A',
        startedAt: new Date(),
      },
    ]);

    const result = await service.join(
      'token-abc',
      { name: 'RapzzKY', confirmParticipantId: 'p1' },
      '1.1.1.1',
    );

    expect(mockRepo.joinSession).not.toHaveBeenCalled();
    expect(mockRepo.updateParticipantToken).toHaveBeenCalledWith(
      'p1',
      expect.any(String),
      expect.any(Date),
    );
    expect(result.resumed).toBe(true);
  });

  const publishedTests = [
    {
      testId: 't1',
      testName: 'DISC Form A',
      testStatus: 'PUBLISHED',
      order: 1,
    },
  ];

  it('creates a new participant when the identity is new', async () => {
    mockRepo.findByToken.mockResolvedValue(baseSession as never);
    mockRepo.findSessionTestsBySessionId.mockResolvedValue(publishedTests);
    mockRepo.findParticipantsBySessionId.mockResolvedValue([
      {
        id: 'p1',
        name: 'Orang Lain',
        email: null,
        candidateNumber: null,
        tokenHash: 'x',
      } as never,
    ]);
    mockRepo.joinSession.mockResolvedValue({
      participant: { id: 'p2', name: 'RapzzKY', email: null } as never,
      participantToken: 'tok',
      attempts: [{ id: 'a2', testId: 't1', testName: 'DISC Form A' }],
      resumed: false,
    });

    const result = await service.join(
      'token-abc',
      { name: 'RapzzKY' },
      '1.1.1.1',
    );

    expect(mockRepo.joinSession).toHaveBeenCalled();
    expect(result.resumed).toBe(false);
  });
});
