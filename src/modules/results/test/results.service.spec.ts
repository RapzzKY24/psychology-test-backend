import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ResultsService } from '../service/results.service';
import type { ResultsRepository } from '../repository/results.repository';
import type { SessionsRepository } from '../../sessions/repository/sessions.repository';
import { hashParticipantToken } from '../../sessions/utils/hash-participant-token';

describe('ResultsService — getPublicResult', () => {
  let service: ResultsService;
  let mockRepo: jest.Mocked<
    Pick<
      ResultsRepository,
      'findAttemptWithResult' | 'findInterpretationByPattern'
    >
  >;
  let mockSessionsRepo: jest.Mocked<
    Pick<SessionsRepository, 'findParticipantByTokenHash'>
  >;

  const completedAt = new Date('2026-09-01T02:00:00Z');

  function attemptDetail(overrides?: {
    userId?: string | null;
    participantId?: string | null;
    attemptStatus?: string;
    resultStatus?: string;
    result?: Record<string, unknown> | null;
  }) {
    return {
      attempt: {
        id: 'attempt-1',
        userId: overrides?.userId ?? null,
        participantId: overrides?.participantId ?? null,
        status: overrides?.attemptStatus ?? 'COMPLETED',
        completedAt,
      },
      test: { id: 'test-1' },
      result:
        overrides?.result === undefined
          ? {
              patternCode: 'SC',
              correctedPatternCode: null,
              scores: { graph: { D: 2, I: 3, S: 8, C: 5 } },
              correctedScores: null,
              status: overrides?.resultStatus ?? 'APPROVED',
            }
          : overrides.result,
    };
  }

  beforeEach(() => {
    mockRepo = {
      findAttemptWithResult: jest.fn(),
      findInterpretationByPattern: jest.fn(),
    };
    mockSessionsRepo = { findParticipantByTokenHash: jest.fn() };
    service = new ResultsService(
      mockRepo as unknown as ResultsRepository,
      mockSessionsRepo as unknown as SessionsRepository,
    );
  });

  it('returns the released view for a guest with only x-participant-token (no cookie)', async () => {
    mockRepo.findAttemptWithResult.mockResolvedValue(
      attemptDetail({ participantId: 'p1' }) as never,
    );
    mockSessionsRepo.findParticipantByTokenHash.mockResolvedValue({
      id: 'p1',
    } as never);
    mockRepo.findInterpretationByPattern.mockResolvedValue({
      title: 'Supporter',
      body: 'Steady and dependable.',
    });

    const data = await service.getPublicResult('attempt-1', {
      participantToken: 'raw-participant-token',
    });

    expect(mockSessionsRepo.findParticipantByTokenHash).toHaveBeenCalledWith(
      hashParticipantToken('raw-participant-token'),
    );
    expect(data).toEqual({
      patternCode: 'SC',
      scores: { graph: { D: 2, I: 3, S: 8, C: 5 } },
      interpretation: { title: 'Supporter', body: 'Steady and dependable.' },
      completedAt,
    });
  });

  it('returns the released view for the owning logged-in user', async () => {
    mockRepo.findAttemptWithResult.mockResolvedValue(
      attemptDetail({ userId: 'user-1' }) as never,
    );
    mockRepo.findInterpretationByPattern.mockResolvedValue(null);

    const data = await service.getPublicResult('attempt-1', {
      userId: 'user-1',
    });

    expect(data.patternCode).toBe('SC');
    expect(data.interpretation).toBeNull();
  });

  it('throws 404 when there is no auth at all (no cookie, no token)', async () => {
    mockRepo.findAttemptWithResult.mockResolvedValue(
      attemptDetail({ participantId: 'p1' }) as never,
    );
    await expect(service.getPublicResult('attempt-1', {})).rejects.toThrow(
      new NotFoundException('Result not found'),
    );
  });

  it('throws 404 (never 403) for another user attemptId', async () => {
    mockRepo.findAttemptWithResult.mockResolvedValue(
      attemptDetail({ userId: 'user-2' }) as never,
    );
    await expect(
      service.getPublicResult('attempt-1', { userId: 'user-1' }),
    ).rejects.toThrow(new NotFoundException('Result not found'));
  });

  it('throws 404 when the attempt or result does not exist', async () => {
    mockRepo.findAttemptWithResult.mockResolvedValue(null);
    await expect(
      service.getPublicResult('missing', { userId: 'user-1' }),
    ).rejects.toThrow(new NotFoundException('Result not found'));

    mockRepo.findAttemptWithResult.mockResolvedValue(
      attemptDetail({ userId: 'user-1', result: null }) as never,
    );
    await expect(
      service.getPublicResult('attempt-1', { userId: 'user-1' }),
    ).rejects.toThrow(new NotFoundException('Result not found'));
  });

  it('throws 403 result_not_released while the result is PENDING_REVIEW', async () => {
    mockRepo.findAttemptWithResult.mockResolvedValue(
      attemptDetail({
        userId: 'user-1',
        resultStatus: 'PENDING_REVIEW',
      }) as never,
    );
    await expect(
      service.getPublicResult('attempt-1', { userId: 'user-1' }),
    ).rejects.toThrow(new ForbiddenException('result_not_released'));
  });

  it('throws 404 when the attempt is not COMPLETED', async () => {
    mockRepo.findAttemptWithResult.mockResolvedValue(
      attemptDetail({
        userId: 'user-1',
        attemptStatus: 'IN_PROGRESS',
      }) as never,
    );
    await expect(
      service.getPublicResult('attempt-1', { userId: 'user-1' }),
    ).rejects.toThrow(new NotFoundException('Result not found'));
  });

  it('uses the effective pattern and scores (corrected ?? system)', async () => {
    mockRepo.findAttemptWithResult.mockResolvedValue({
      ...attemptDetail({ userId: 'user-1' }),
      result: {
        patternCode: 'SC',
        correctedPatternCode: 'DI',
        scores: { graph: { D: 2, I: 3, S: 8, C: 5 } },
        correctedScores: { graph: { D: 9, I: 7, S: 1, C: 3 } },
        status: 'APPROVED',
      },
    } as never);
    mockRepo.findInterpretationByPattern.mockResolvedValue(null);

    const data = await service.getPublicResult('attempt-1', {
      userId: 'user-1',
    });

    expect(data.patternCode).toBe('DI');
    expect(data.scores).toEqual({ graph: { D: 9, I: 7, S: 1, C: 3 } });
    expect(mockRepo.findInterpretationByPattern).toHaveBeenCalledWith(
      'test-1',
      'DI',
    );
  });

  it('hands a raw-score family the record the result page reads', async () => {
    // Wrapping `{ raw, total, iq }` in `graph` hid every key the participant
    // summary looks for, so the page fell back to drawing bare number bars.
    mockRepo.findAttemptWithResult.mockResolvedValue({
      ...attemptDetail({ userId: 'user-1' }),
      test: { id: 'test-1', scorerType: 'RIGHT_WRONG_NORM' },
      result: {
        patternCode: 'RAW_6',
        correctedPatternCode: null,
        scores: { raw: 6, total: 50, perItem: [false], iq: 71 },
        correctedScores: null,
        status: 'APPROVED',
      },
    } as never);
    mockRepo.findInterpretationByPattern.mockResolvedValue(null);

    const data = await service.getPublicResult('attempt-1', {
      userId: 'user-1',
    });

    expect(data.scores).toEqual({ raw: 6, total: 50, iq: 71 });
  });

  it('keeps a graph-only family reduced to its graph', async () => {
    mockRepo.findAttemptWithResult.mockResolvedValue({
      ...attemptDetail({ userId: 'user-1' }),
      test: { id: 'test-1', scorerType: 'FORCED_CHOICE_DISC' },
      result: {
        patternCode: 'SC',
        correctedPatternCode: null,
        scores: { graph: { D: 2, I: 3, S: 8, C: 5 }, most: 12, least: 4 },
        correctedScores: null,
        status: 'APPROVED',
      },
    } as never);
    mockRepo.findInterpretationByPattern.mockResolvedValue(null);

    const data = await service.getPublicResult('attempt-1', {
      userId: 'user-1',
    });

    expect(data.scores).toEqual({ graph: { D: 2, I: 3, S: 8, C: 5 } });
  });
});
