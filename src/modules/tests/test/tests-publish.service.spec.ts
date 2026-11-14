/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { TestsPublishService } from '../service/tests-publish.service';
import type { TestsRepository } from '../repository/tests.repository';

describe('TestsPublishService', () => {
  let service: TestsPublishService;
  let mockRepo: jest.Mocked<TestsRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findBySlug: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      hasInProgressAttempts: jest.fn(),
      replaceItems: jest.fn(),
      replaceInterpretations: jest.fn(),
      findItemsByTestId: jest.fn(),
      findInterpretationsByTestId: jest.fn(),
      findDetailById: jest.fn(),
    };
    service = new TestsPublishService(mockRepo);
  });

  describe('publish', () => {
    it('should throw 404 if not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.publish('id')).rejects.toThrow('Test not found');
    });

    it('should throw 409 if ARCHIVED', async () => {
      mockRepo.findById.mockResolvedValue({
        id: '1',
        status: 'ARCHIVED',
      } as any);
      await expect(service.publish('1')).rejects.toThrow(
        'cannot publish ARCHIVED test',
      );
    });

    it('should throw 422 if no items', async () => {
      mockRepo.findById.mockResolvedValue({
        id: '1',
        status: 'DRAFT',
        scorerType: 'FORCED_CHOICE_DISC',
      } as any);
      mockRepo.findItemsByTestId.mockResolvedValue([]);
      await expect(service.publish('1')).rejects.toThrow('validation_failed');
    });

    it('should throw 422 for invalid item content', async () => {
      mockRepo.findById.mockResolvedValue({
        id: '1',
        status: 'DRAFT',
        scorerType: 'FORCED_CHOICE_DISC',
      } as any);
      mockRepo.findItemsByTestId.mockResolvedValue([
        {
          content: {
            words: ['Only', 'Three', 'Words'],
            mostMapping: ['D', 'I', 'S', 'C'],
            leastMapping: ['D', 'I', 'S', 'C'],
          },
        },
      ]);
      await expect(service.publish('1')).rejects.toThrow('validation_failed');
    });

    it('should throw 422 if missing pattern codes', async () => {
      mockRepo.findById.mockResolvedValue({
        id: '1',
        status: 'DRAFT',
        scorerType: 'FORCED_CHOICE_DISC',
      } as any);
      mockRepo.findItemsByTestId.mockResolvedValue([
        {
          content: {
            words: ['A', 'B', 'C', 'D'],
            mostMapping: ['D', 'I', 'S', 'C'],
            leastMapping: ['D', 'I', 'S', 'C'],
          },
        },
      ]);
      mockRepo.findInterpretationsByTestId.mockResolvedValue([
        { patternCode: 'D' },
      ]);
      await expect(service.publish('1')).rejects.toThrow('validation_failed');
    });

    it('should throw 422 for a scoringConfig the family cannot read', async () => {
      mockRepo.findById.mockResolvedValue({
        id: '1',
        status: 'DRAFT',
        scorerType: 'LIKERT',
        // `ratingrange` — a typo the scorer would silently ignore.
        scoringConfig: { ratingrange: { min: 1, max: 5 } },
      } as any);
      mockRepo.findItemsByTestId.mockResolvedValue([
        { content: { text: 'Saya suka bergaul', scale: 'E' } },
      ]);
      mockRepo.findInterpretationsByTestId.mockResolvedValue([]);

      await expect(service.publish('1')).rejects.toMatchObject({
        response: {
          message: 'validation_failed',
          details: [expect.stringMatching(/scoringConfig.*ratingrange/)],
        },
      });
    });

    it('should publish when all valid', async () => {
      mockRepo.findById.mockResolvedValue({
        id: '1',
        status: 'DRAFT',
        scorerType: 'FORCED_CHOICE_DISC',
      } as any);
      mockRepo.findItemsByTestId.mockResolvedValue([
        {
          content: {
            words: ['A', 'B', 'C', 'D'],
            mostMapping: ['D', 'I', 'S', 'C'],
            leastMapping: ['D', 'I', 'S', 'C'],
          },
        },
      ]);
      const fullInterps = Array.from(
        { length: 40 },
        (_, i) => ({ patternCode: String(i + 1) }) as any,
      );
      mockRepo.findInterpretationsByTestId.mockResolvedValue(fullInterps);
      mockRepo.update.mockResolvedValue({
        id: '1',
        status: 'PUBLISHED',
      } as any);
      const result = await service.publish('1');
      expect(result.status).toBe('PUBLISHED');
    });
  });

  describe('archive', () => {
    it('should throw 404 if not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.archive('id')).rejects.toThrow('Test not found');
    });

    it('should throw 409 if not PUBLISHED', async () => {
      mockRepo.findById.mockResolvedValue({ id: '1', status: 'DRAFT' } as any);
      await expect(service.archive('1')).rejects.toThrow(
        'only PUBLISHED test can be archived',
      );
    });

    it('should archive when PUBLISHED', async () => {
      mockRepo.findById.mockResolvedValue({
        id: '1',
        status: 'PUBLISHED',
      } as any);
      mockRepo.update.mockResolvedValue({ id: '1', status: 'ARCHIVED' } as any);
      const result = await service.archive('1');
      expect(result.status).toBe('ARCHIVED');
    });
  });
});
