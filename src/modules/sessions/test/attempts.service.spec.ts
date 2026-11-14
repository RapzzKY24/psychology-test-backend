/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method */
import { AttemptsService } from '../service/attempts.service';
import type {
  AttemptsRepository,
  AttemptAccessDetail,
} from '../repository/attempts.repository';

const NOW = Date.now();
const future = new Date(NOW + 60 * 60 * 1000);
const pastGrace = new Date(NOW - 25 * 60 * 60 * 1000); // beyond expiresAt + 24h

function makeDetail(
  overrides: Partial<AttemptAccessDetail> = {},
): AttemptAccessDetail {
  return {
    attempt: {
      id: 'att-1',
      sessionId: 'sess-1',
      testId: 't-1',
      status: 'IN_PROGRESS',
      startedAt: new Date(NOW),
      completedAt: null,
      participantId: 'p-1',
      birthDate: null,
    },
    test: {
      id: 't-1',
      name: 'DISC',
      scorerType: 'FORCED_CHOICE_DISC',
      status: 'PUBLISHED',
      timeLimitMin: null,
      normTable: null,
      ageMinMonths: null,
      ageMaxMonths: null,
    },
    session: {
      id: 'sess-1',
      status: 'ACTIVE',
      expiresAt: future,
    },
    items: [
      {
        id: 'it-1',
        order: 1,
        content: {
          words: ['a', 'b', 'c', 'd'],
          mostMapping: ['D', 'I', 'S', 'C'],
          leastMapping: ['D', 'I', 'S', 'C'],
        },
      },
      {
        id: 'it-2',
        order: 2,
        content: {
          words: ['e', 'f', 'g', 'h'],
          mostMapping: ['I', 'D', 'S', 'C'],
          leastMapping: ['I', 'D', 'S', 'C'],
        },
      },
    ],
    responses: [],
    ...overrides,
  };
}

describe('AttemptsService', () => {
  let service: AttemptsService;
  let mockRepo: jest.Mocked<AttemptsRepository>;

  beforeEach(() => {
    mockRepo = {
      findAccessDetail: jest.fn(),
      setBirthDate: jest.fn(),
      upsertResponse: jest.fn(),
      findResultByAttemptId: jest.fn(),
      completeAndCreateResult: jest.fn(),
      listByUser: jest.fn(),
    };
    service = new AttemptsService(mockRepo);
  });

  describe('read', () => {
    it('throws 404 when attempt not found', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(null);
      await expect(service.read('att-x', 'p-1')).rejects.toThrow(
        'Attempt not found',
      );
    });

    it('throws 404 when the participant is not the owner (no existence leak)', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(makeDetail());
      await expect(service.read('att-1', 'p-OTHER')).rejects.toThrow(
        'Attempt not found',
      );
    });

    it('returns items with hidden mapping stripped + responses', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(
        makeDetail({
          responses: [{ itemId: 'it-1', value: { most: 0, least: 1 } }],
        }),
      );
      const out = await service.read('att-1', 'p-1');
      expect(out.items[0].content).toEqual({ words: ['a', 'b', 'c', 'd'] });
      expect(JSON.stringify(out.items)).not.toContain('mapping');
      expect(out.responses).toEqual([
        { itemId: 'it-1', value: { most: 0, least: 1 } },
      ]);
      expect(out.testName).toBe('DISC');
      expect(out.scorerType).toBe('FORCED_CHOICE_DISC');
    });
  });

  describe('respond', () => {
    it('throws 404 for non-owner', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(makeDetail());
      await expect(
        service.respond(
          'att-1',
          { itemId: 'it-1', value: { most: 0, least: 1 } },
          'p-OTHER',
        ),
      ).rejects.toThrow('Attempt not found');
    });

    it('throws 409 attempt_not_in_progress when the attempt is COMPLETED', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(
        makeDetail({
          attempt: { ...makeDetail().attempt, status: 'COMPLETED' },
        }),
      );
      await expect(
        service.respond(
          'att-1',
          { itemId: 'it-1', value: { most: 0, least: 1 } },
          'p-1',
        ),
      ).rejects.toThrow('attempt_not_in_progress');
    });

    it('throws 410 session_expired when beyond the 24h grace window', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(
        makeDetail({
          session: { id: 'sess-1', status: 'ACTIVE', expiresAt: pastGrace },
        }),
      );
      await expect(
        service.respond(
          'att-1',
          { itemId: 'it-1', value: { most: 0, least: 1 } },
          'p-1',
        ),
      ).rejects.toThrow('session_expired');
    });

    it("throws 422 when the item does not belong to the attempt's test", async () => {
      mockRepo.findAccessDetail.mockResolvedValue(makeDetail());
      await expect(
        service.respond(
          'att-1',
          { itemId: 'it-WRONG', value: { most: 0, least: 1 } },
          'p-1',
        ),
      ).rejects.toThrow('validation_failed');
    });

    it('throws 422 when the value fails the scorer response schema (most === least)', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(makeDetail());
      await expect(
        service.respond(
          'att-1',
          { itemId: 'it-1', value: { most: 0, least: 0 } },
          'p-1',
        ),
      ).rejects.toThrow('validation_failed');
    });

    it('upserts a valid response', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(makeDetail());
      await service.respond(
        'att-1',
        { itemId: 'it-1', value: { most: 0, least: 1 } },
        'p-1',
      );
      expect(mockRepo.upsertResponse).toHaveBeenCalledWith('att-1', 'it-1', {
        most: 0,
        least: 1,
      });
    });
  });

  describe('complete', () => {
    const result = {
      id: 'res-1',
      attemptId: 'att-1',
      scores: {
        most: { D: 2, I: 1, S: 0, C: 0 },
        least: { D: 1, I: 2, S: 0, C: 0 },
      },
      patternCode: 'D',
      status: 'PENDING_REVIEW',
    } as any;

    it('throws 404 for non-owner', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(makeDetail());
      await expect(service.complete('att-1', 'p-OTHER')).rejects.toThrow(
        'Attempt not found',
      );
    });

    it('throws 422 listing missing item ids when not every item is answered', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(
        makeDetail({
          responses: [{ itemId: 'it-1', value: { most: 0, least: 1 } }],
        }),
      );
      await expect(service.complete('att-1', 'p-1')).rejects.toThrow(
        'validation_failed',
      );
    });

    it('is idempotent: returns the existing result without re-scoring when already COMPLETED', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(
        makeDetail({
          attempt: {
            ...makeDetail().attempt,
            status: 'COMPLETED',
            completedAt: new Date(NOW),
          },
        }),
      );
      mockRepo.findResultByAttemptId.mockResolvedValue(result);
      const out = await service.complete('att-1', 'p-1');
      expect(out.result).toBe(result);
      expect(mockRepo.completeAndCreateResult).not.toHaveBeenCalled();
    });

    it('runs the scorer and calls completeAndCreateResult on a full attempt', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(
        makeDetail({
          responses: [
            { itemId: 'it-1', value: { most: 0, least: 1 } },
            { itemId: 'it-2', value: { most: 0, least: 1 } },
          ],
        }),
      );
      mockRepo.completeAndCreateResult.mockResolvedValue(result);
      const out = await service.complete('att-1', 'p-1');
      expect(out.status).toBe('COMPLETED');
      expect(mockRepo.completeAndCreateResult).toHaveBeenCalledWith(
        expect.objectContaining({
          attemptId: 'att-1',
          patternCode: expect.any(String),
        }),
      );
    });
  });
  describe('time limit', () => {
    const rawTest = {
      id: 't-1',
      name: 'WPT',
      scorerType: 'RIGHT_WRONG_NORM',
      status: 'PUBLISHED',
      timeLimitMin: 12,
      normTable: [{ raw: 0, iq: 59 }],
      ageMinMonths: null,
      ageMaxMonths: null,
    };
    const rawItems = [
      {
        id: 'it-1',
        order: 1,
        content: { question: 'Q1', options: ['a', 'b'], correctIndexes: [0] },
      },
    ];

    it('reports the seconds left, derived from startedAt', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(
        makeDetail({
          test: rawTest,
          items: rawItems,
          attempt: {
            ...makeDetail().attempt,
            startedAt: new Date(Date.now() - 60_000),
          },
        }),
      );
      const out = await service.read('att-1', 'p-1');
      expect(out.timeLimitMin).toBe(12);
      // 12 minutes minus the one already spent.
      expect(out.remainingSeconds).toBeGreaterThanOrEqual(659);
      expect(out.remainingSeconds).toBeLessThanOrEqual(660);
    });

    it('never reports a negative countdown after the deadline', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(
        makeDetail({
          test: rawTest,
          items: rawItems,
          attempt: {
            ...makeDetail().attempt,
            startedAt: new Date(Date.now() - 20 * 60_000),
          },
        }),
      );
      const out = await service.read('att-1', 'p-1');
      expect(out.remainingSeconds).toBe(0);
    });

    it('leaves remainingSeconds null when the test is untimed', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(makeDetail());
      const out = await service.read('att-1', 'p-1');
      expect(out.remainingSeconds).toBeNull();
    });

    it('rejects a late response with attempt_time_expired', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(
        makeDetail({
          test: rawTest,
          items: rawItems,
          attempt: {
            ...makeDetail().attempt,
            startedAt: new Date(NOW - 13 * 60 * 1000),
          },
        }),
      );
      await expect(
        service.respond(
          'att-1',
          { itemId: 'it-1', value: { chosen: 0 } },
          'p-1',
        ),
      ).rejects.toThrow('attempt_time_expired');
      expect(mockRepo.upsertResponse).not.toHaveBeenCalled();
    });

    it('still accepts a response inside the window', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(
        makeDetail({
          test: rawTest,
          items: rawItems,
          attempt: {
            ...makeDetail().attempt,
            startedAt: new Date(NOW - 11 * 60 * 1000),
          },
        }),
      );
      await service.respond(
        'att-1',
        { itemId: 'it-1', value: { chosen: 0 } },
        'p-1',
      );
      expect(mockRepo.upsertResponse).toHaveBeenCalled();
    });

    it('lets a raw-score attempt be submitted with blanks (blank = wrong)', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(
        makeDetail({ test: rawTest, items: rawItems, responses: [] }),
      );
      mockRepo.completeAndCreateResult.mockResolvedValue({
        id: 'res-1',
        patternCode: 'RAW_0',
      } as any);
      const out = await service.complete('att-1', 'p-1');
      expect(out.status).toBe('COMPLETED');
      expect(mockRepo.completeAndCreateResult).toHaveBeenCalledWith(
        expect.objectContaining({ patternCode: 'RAW_0' }),
      );
    });

    it('passes the norm table to the scorer', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(
        makeDetail({ test: rawTest, items: rawItems, responses: [] }),
      );
      mockRepo.completeAndCreateResult.mockResolvedValue({
        id: 'res-1',
        patternCode: 'RAW_0',
      } as any);
      await service.complete('att-1', 'p-1');
      const [scores] = mockRepo.completeAndCreateResult.mock.calls[0];
      expect(scores.scores).toEqual(
        expect.objectContaining({ raw: 0, total: 1, iq: 59 }),
      );
    });

    it('still refuses a DISC attempt with missing word pairs', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(makeDetail());
      await expect(service.complete('att-1', 'p-1')).rejects.toThrow(
        'validation_failed',
      );
    });
  });

  describe('age band gate', () => {
    // CFIT 2's ladder covers 14y0m–14y11m only.
    const bandedTest = {
      id: 't-1',
      name: 'CFIT 2',
      scorerType: 'RIGHT_WRONG_NORM',
      status: 'PUBLISHED',
      timeLimitMin: null,
      normTable: null,
      ageMinMonths: 168,
      ageMaxMonths: 179,
    };

    function birthDateYearsAgo(years: number, extraMonths = 0): string {
      const now = new Date();
      const date = new Date(
        Date.UTC(
          now.getUTCFullYear() - years,
          now.getUTCMonth() - extraMonths,
          1,
        ),
      );
      return date.toISOString().slice(0, 10);
    }

    it('asks for a birth date when the attempt has none', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(
        makeDetail({ test: bandedTest }),
      );
      await expect(service.read('att-1', 'p-1')).rejects.toThrow(
        'birth_date_required',
      );
      expect(mockRepo.setBirthDate).not.toHaveBeenCalled();
    });

    it('rejects an impossible birth date', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(
        makeDetail({ test: bandedTest }),
      );
      await expect(service.read('att-1', 'p-1', '2012-02-30')).rejects.toThrow(
        'birth_date_invalid',
      );
    });

    it('rejects a participant outside the band and stores nothing', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(
        makeDetail({ test: bandedTest }),
      );
      await expect(
        service.read('att-1', 'p-1', birthDateYearsAgo(13)),
      ).rejects.toThrow('age_out_of_band');
      expect(mockRepo.setBirthDate).not.toHaveBeenCalled();
    });

    it('records the birth date once when the age fits', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(
        makeDetail({ test: bandedTest }),
      );
      const birthDate = birthDateYearsAgo(14, 3);
      const out = await service.read('att-1', 'p-1', birthDate);
      expect(out.id).toBe('att-1');
      expect(mockRepo.setBirthDate).toHaveBeenCalledWith(
        'att-1',
        new Date(`${birthDate}T00:00:00.000Z`),
      );
    });

    it('keeps the stored date even when a fitting one is offered later', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(
        makeDetail({
          test: bandedTest,
          attempt: {
            ...makeDetail().attempt,
            birthDate: new Date(`${birthDateYearsAgo(13)}T00:00:00.000Z`),
          },
        }),
      );
      await expect(
        service.read('att-1', 'p-1', birthDateYearsAgo(14)),
      ).rejects.toThrow('age_out_of_band');
      expect(mockRepo.setBirthDate).not.toHaveBeenCalled();
    });

    it('does not ask on an unbanded test', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(makeDetail());
      const out = await service.read('att-1', 'p-1');
      expect(out.id).toBe('att-1');
      expect(mockRepo.setBirthDate).not.toHaveBeenCalled();
    });

    it('refuses to complete a banded attempt with no recorded birth date', async () => {
      mockRepo.findAccessDetail.mockResolvedValue(
        makeDetail({ test: bandedTest }),
      );
      await expect(service.complete('att-1', 'p-1')).rejects.toThrow(
        'birth_date_required',
      );
    });
  });
});
