/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method */
import { HttpException } from '@nestjs/common';
import { ReviewsService } from '../service/reviews.service';
import type {
  ReviewsRepository,
  VerifyLookup,
} from '../repository/reviews.repository';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let mockRepo: jest.Mocked<ReviewsRepository>;

  beforeEach(() => {
    mockRepo = {
      listReviews: jest.fn(),
      findDetailById: jest.fn(),
      updateNotes: jest.fn(),
      findPsychologistProfile: jest.fn(),
      approve: jest.fn(),
      returnForReason: jest.fn(),
      applyCorrection: jest.fn(),
      resubmit: jest.fn(),
      findById: jest.fn(),
      findByVerifyCode: jest.fn(),
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

  describe('verify', () => {
    const approvedLookup: VerifyLookup = {
      result: { id: 'r1', reviewedAt: new Date('2026-01-01') } as any,
      test: { name: 'DISC' },
      attempt: { completedAt: new Date('2026-01-01') },
      psychologist: {
        fullName: 'Dr. Budi',
        degree: 'M.Psi',
        licenseNumber: 'PSI-123',
      },
      participantName: 'Budi Santoso',
    };

    it('should return masked data for APPROVED result', async () => {
      mockRepo.findByVerifyCode.mockResolvedValue(approvedLookup);
      const result = await service.verify('ABCD12EFGH', '1.1.1.1');
      expect(result.valid).toBe(true);
      expect(result.testName).toBe('DISC');
      expect(result.participantName).toBe('Budi S.');
      expect(result.approvedBy).toEqual({
        fullName: 'Dr. Budi',
        degree: 'M.Psi',
        licenseNumber: 'PSI-123',
      });
      expect(result).not.toHaveProperty('scores');
    });

    it('should return valid:false for unknown code', async () => {
      mockRepo.findByVerifyCode.mockResolvedValue(null);
      const result = await service.verify('WRONGCODE', '1.1.1.1');
      expect(result).toEqual({ valid: false });
    });

    it('should normalize code to uppercase', async () => {
      mockRepo.findByVerifyCode.mockResolvedValue(null);
      await service.verify('abcd12efgh', '1.1.1.1');
      expect(mockRepo.findByVerifyCode).toHaveBeenCalledWith('ABCD12EFGH');
    });

    it('should block the 31st request from same IP', async () => {
      mockRepo.findByVerifyCode.mockResolvedValue(null);
      for (let i = 0; i < 30; i++) {
        await service.verify('ABCD12EFGH', '2.2.2.2');
      }
      await expect(service.verify('ABCD12EFGH', '2.2.2.2')).rejects.toThrow(
        HttpException,
      );
      expect(mockRepo.findByVerifyCode).toHaveBeenCalledTimes(30);
    });

    it('should not count other IPs against the limit', async () => {
      mockRepo.findByVerifyCode.mockResolvedValue(null);
      for (let i = 0; i < 30; i++) {
        await service.verify('ABCD12EFGH', '3.3.3.3');
      }
      const result = await service.verify('ABCD12EFGH', '4.4.4.4');
      expect(result.valid).toBe(false);
    });
  });
});
