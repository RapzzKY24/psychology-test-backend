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
    },
    test: {
      id: 't-1',
      name: 'DISC',
      scorerType: 'FORCED_CHOICE_DISC',
      status: 'PUBLISHED',
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
      upsertResponse: jest.fn(),
      findResultByAttemptId: jest.fn(),
      completeAndCreateResult: jest.fn(),
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
});
