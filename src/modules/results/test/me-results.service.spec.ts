import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MeResultsService } from '../service/me-results.service';
import type { ResultsRepository } from '../repository/results.repository';

describe('MeResultsService', () => {
  let service: MeResultsService;
  let mockRepo: jest.Mocked<Pick<ResultsRepository, 'listApprovedByUser'>>;
  let mockResultsService: { getPublicResult: jest.Mock };

  beforeEach(() => {
    mockRepo = { listApprovedByUser: jest.fn() };
    mockResultsService = { getPublicResult: jest.fn() };
    service = new MeResultsService(
      mockRepo as unknown as ResultsRepository,
      mockResultsService as unknown as never,
    );
  });

  describe('list', () => {
    it('returns only the caller own APPROVED rows with pagination meta', async () => {
      mockRepo.listApprovedByUser.mockResolvedValue({
        data: [
          {
            attemptId: 'a1',
            testName: 'DISC Form A',
            patternCode: 'ID',
            correctedPatternCode: null,
            completedAt: new Date('2026-09-01T02:00:00Z'),
            approvedAt: new Date('2026-09-02T02:00:00Z'),
          },
        ],
        total: 12,
      });

      const result = await service.list('user-1', {
        page: 2,
        limit: 10,
      });

      expect(mockRepo.listApprovedByUser).toHaveBeenCalledWith({
        userId: 'user-1',
        skip: 10,
        take: 10,
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({
        attemptId: 'a1',
        testName: 'DISC Form A',
        patternCode: 'ID',
        completedAt: new Date('2026-09-01T02:00:00Z'),
        approvedAt: new Date('2026-09-02T02:00:00Z'),
      });
      expect(result.meta).toEqual({
        page: 2,
        limit: 10,
        total: 12,
        totalPages: 2,
      });
    });

    it('exposes the effective patternCode (corrected ?? system)', async () => {
      mockRepo.listApprovedByUser.mockResolvedValue({
        data: [
          {
            attemptId: 'a1',
            testName: 'DISC Form A',
            patternCode: 'SC',
            correctedPatternCode: 'DI',
            completedAt: null,
            approvedAt: null,
          },
        ],
        total: 1,
      });

      const result = await service.list('user-1', {
        page: 1,
        limit: 10,
      });

      expect(result.data[0].patternCode).toBe('DI');
    });

    it('returns empty data when the user has no APPROVED results', async () => {
      mockRepo.listApprovedByUser.mockResolvedValue({ data: [], total: 0 });

      const result = await service.list('user-1', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });
    });
  });

  describe('getOwnResult', () => {
    it('delegates to the feature 05 public result view scoped to the caller', async () => {
      const view = {
        patternCode: 'ID',
        scores: { graph: {} },
        interpretation: { title: 'Influential', body: '...' },
        completedAt: new Date('2026-09-01T02:00:00Z'),
      };
      mockResultsService.getPublicResult.mockResolvedValue(view);

      const result = await service.getOwnResult('user-1', 'attempt-1');

      expect(mockResultsService.getPublicResult).toHaveBeenCalledWith(
        'attempt-1',
        { userId: 'user-1' },
      );
      expect(result).toEqual(view);
    });

    it('propagates 404 when the attempt is not owned by the caller', async () => {
      mockResultsService.getPublicResult.mockRejectedValue(
        new NotFoundException('Result not found'),
      );
      await expect(service.getOwnResult('user-1', 'attempt-1')).rejects.toThrow(
        new NotFoundException('Result not found'),
      );
    });

    it('propagates 403 result_not_released when the result is not APPROVED', async () => {
      mockResultsService.getPublicResult.mockRejectedValue(
        new ForbiddenException('result_not_released'),
      );
      await expect(service.getOwnResult('user-1', 'attempt-1')).rejects.toThrow(
        new ForbiddenException('result_not_released'),
      );
    });
  });
});
