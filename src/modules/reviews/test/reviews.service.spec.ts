/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method */
import { ReviewsService } from '../service/reviews.service';
import type { ReviewsRepository } from '../repository/reviews.repository';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let mockRepo: jest.Mocked<ReviewsRepository>;

  beforeEach(() => {
    mockRepo = {
      listReviews: jest.fn(),
      findDetailById: jest.fn(),
      updateNotes: jest.fn(),
    };
    service = new ReviewsService(mockRepo);
  });

  describe('listReviews', () => {
    it('should paginate and filter by status', async () => {
      mockRepo.listReviews.mockResolvedValue({
        data: [{ resultId: '1' } as any],
        total: 1,
      });
      const result = await service.listReviews({
        page: 1,
        limit: 10,
        status: 'PENDING_REVIEW',
      } as any);
      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
      expect(mockRepo.listReviews).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'PENDING_REVIEW' } }),
      );
    });
  });

  describe('getDetail', () => {
    it('should throw 404 if not found', async () => {
      mockRepo.findDetailById.mockResolvedValue(null);
      await expect(service.getDetail('id')).rejects.toThrow('Result not found');
    });

    it('should return detail with per-item responses', async () => {
      const detail = {
        result: { id: 'r1' },
        items: [
          { id: 'i1', order: 1, content: { words: ['a', 'b', 'c', 'd'] } },
        ],
        responses: [{ itemId: 'i1', value: { most: 0, least: 1 } }],
      } as any;
      mockRepo.findDetailById.mockResolvedValue(detail);
      const result = await service.getDetail('r1');
      expect(result.items).toHaveLength(1);
      expect(result.responses).toHaveLength(1);
    });
  });

  describe('updateNotes', () => {
    it('should throw 404 if not found', async () => {
      mockRepo.findDetailById.mockResolvedValue(null);
      await expect(service.updateNotes('id', 'notes')).rejects.toThrow(
        'Result not found',
      );
    });

    it('should update notes', async () => {
      mockRepo.findDetailById.mockResolvedValue({
        result: { id: 'r1' },
      } as any);
      mockRepo.updateNotes.mockResolvedValue({
        id: 'r1',
        notes: 'hello',
      } as any);
      const result = await service.updateNotes('r1', 'hello');
      expect(result.notes).toBe('hello');
    });
  });
});
