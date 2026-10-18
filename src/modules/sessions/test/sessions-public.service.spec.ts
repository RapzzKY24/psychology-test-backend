/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { SessionsPublicService } from '../service/sessions-public.service';
import type { SessionsRepository } from '../repository/sessions.repository';

describe('SessionsPublicService', () => {
  let service: SessionsPublicService;
  let mockRepo: jest.Mocked<
    Pick<
      SessionsRepository,
      | 'findByToken'
      | 'findSessionTestsBySessionId'
      | 'findParticipantsBySessionId'
      | 'findAttemptsByParticipantId'
      | 'claimSeatWithAttempts'
    >
  >;

  const sessionRow = {
    id: 's1',
    title: 'Rekrutmen Batch Sep',
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    slotLimit: 20,
    pinHash: 'hashed',
    joinMode: 'OPEN',
  };

  beforeEach(() => {
    mockRepo = {
      findByToken: jest.fn().mockResolvedValue(sessionRow),
      findSessionTestsBySessionId: jest.fn().mockResolvedValue([
        {
          testId: 't1',
          testName: 'DISC Form A',
          testStatus: 'PUBLISHED',
          order: 1,
        },
      ]),
      findParticipantsBySessionId: jest.fn().mockResolvedValue([]),
      findAttemptsByParticipantId: jest.fn().mockResolvedValue([]),
      claimSeatWithAttempts: jest.fn().mockResolvedValue(true),
    };
    service = new SessionsPublicService(
      mockRepo as unknown as SessionsRepository,
    );
  });

  describe('getPreviewByToken', () => {
    it('returns a public-safe preview with sessionId for an open session', async () => {
      const preview = await service.getPreviewByToken('token-abc');

      expect(preview.sessionId).toBe('s1');
      expect(preview.title).toBe('Rekrutmen Batch Sep');
      expect(preview.joinMode).toBe('OPEN');
      expect(preview.roster).toBeUndefined();
      expect(preview.tests).toEqual([{ order: 1, testName: 'DISC Form A' }]);
      expect(preview.slotsUsed).toBe(0);
      expect(preview.requiresPin).toBe(true);
      expect(preview.active).toBe(true);
    });

    it('reports active:false for an unpaid (PENDING_PAYMENT) session', async () => {
      mockRepo.findByToken.mockResolvedValue({
        ...sessionRow,
        status: 'PENDING_PAYMENT',
      } as never);

      const preview = await service.getPreviewByToken('token-abc');

      expect(preview.status).toBe('PENDING_PAYMENT');
      expect(preview.active).toBe(false);
    });

    it('includes roster rows with claimed state for roster sessions', async () => {
      const rosterSession = {
        ...sessionRow,
        id: 's2',
        joinMode: 'ROSTER',
      };
      mockRepo.findByToken.mockResolvedValue(rosterSession as never);
      mockRepo.findParticipantsBySessionId.mockResolvedValue([
        {
          id: 'r1',
          name: 'Budi Santoso',
          email: null,
          candidateNumber: '3',
          tokenHash: 'h1',
          claimedAt: new Date('2026-09-06T02:00:00Z'),
          joinedAt: new Date('2026-09-06T02:00:00Z'),
        },
        {
          id: 'r2',
          name: 'Siti Aminah',
          email: null,
          candidateNumber: '4',
          tokenHash: null,
          claimedAt: null,
          joinedAt: new Date('2026-09-06T02:00:00Z'),
        },
      ] as never);

      const preview = await service.getPreviewByToken('token-abc');

      expect(preview.joinMode).toBe('ROSTER');
      expect(preview.roster).toEqual([
        { id: 'r1', name: 'Budi Santoso', candidateNumber: '3', claimed: true },
        { id: 'r2', name: 'Siti Aminah', candidateNumber: '4', claimed: false },
      ]);
    });

    it('throws NotFound for an unknown token (no session detail leak)', async () => {
      mockRepo.findByToken.mockResolvedValue(null);
      await expect(service.getPreviewByToken('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('claim', () => {
    const rosterSession = {
      ...sessionRow,
      joinMode: 'ROSTER',
    };

    it('issues a fresh token for a roster participant', async () => {
      mockRepo.findByToken.mockResolvedValue(rosterSession as never);
      mockRepo.findParticipantsBySessionId.mockResolvedValue([
        {
          id: 'r1',
          name: 'Budi Santoso',
          email: null,
          candidateNumber: '3',
          claimedAt: null,
          joinedAt: new Date('2026-09-06T02:00:00Z'),
          tokenHash: null,
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

      const result = await service.claim('token-abc', 'r1', '1.1.1.1');

      expect(mockRepo.claimSeatWithAttempts).toHaveBeenCalledWith(
        expect.objectContaining({
          seatId: 'r1',
          tokenHash: expect.any(String),
          claimedAt: expect.any(Date),
          sessionId: 's1',
          testIds: ['t1'],
        }),
      );
      expect(result.resumed).toBe(true);
      expect(result.participant.id).toBe('r1');
      expect(result.attempts).toHaveLength(1);
    });

    it('throws 403 session_unpaid for a PENDING_PAYMENT session', async () => {
      mockRepo.findByToken.mockResolvedValue({
        ...rosterSession,
        status: 'PENDING_PAYMENT',
      } as never);

      await expect(service.claim('token-abc', 'r1', '1.1.1.1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockRepo.claimSeatWithAttempts).not.toHaveBeenCalled();
    });

    it('throws 404 for an OPEN session (roster claim only)', async () => {
      mockRepo.findByToken.mockResolvedValue(sessionRow as never);

      await expect(service.claim('token-abc', 'r1', '1.1.1.1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepo.claimSeatWithAttempts).not.toHaveBeenCalled();
    });

    it('throws 409 seat_claimed when device B claims a seat locked by device A', async () => {
      mockRepo.findByToken.mockResolvedValue(rosterSession as never);
      mockRepo.findParticipantsBySessionId.mockResolvedValue([
        { id: 'r1', claimedAt: null, tokenHash: null },
      ] as never);
      mockRepo.claimSeatWithAttempts.mockResolvedValue(false);

      await expect(service.claim('token-abc', 'r1', '1.1.1.1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepo.findAttemptsByParticipantId).not.toHaveBeenCalled();
    });

    it('lets exactly one of two parallel claims win', async () => {
      mockRepo.findByToken.mockResolvedValue(rosterSession as never);
      mockRepo.findParticipantsBySessionId.mockResolvedValue([
        { id: 'r1', claimedAt: null, tokenHash: null },
      ] as never);
      mockRepo.claimSeatWithAttempts
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const results = await Promise.allSettled([
        service.claim('token-abc', 'r1', '1.1.1.1'),
        service.claim('token-abc', 'r1', '2.2.2.2'),
      ]);

      const ok = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(ok).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    });

    it('throws Gone for an expired session and 404 for a foreign participantId', async () => {
      mockRepo.findByToken.mockResolvedValue({
        ...rosterSession,
        expiresAt: new Date('2020-01-01T00:00:00Z'),
      } as never);
      await expect(service.claim('token-abc', 'r1', '1.1.1.1')).rejects.toThrow(
        GoneException,
      );

      mockRepo.findByToken.mockResolvedValue(rosterSession as never);
      mockRepo.findParticipantsBySessionId.mockResolvedValue([] as never);
      await expect(
        service.claim('token-abc', 'ghost', '1.1.1.1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
