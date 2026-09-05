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

  describe('approve', () => {
    it('should throw 404 if result not found', async () => {
      mockRepo.findDetailById.mockResolvedValue(null);
      await expect(service.approve('id', 'psy1')).rejects.toThrow(
        'Result not found',
      );
    });

    it('should throw 409 if already APPROVED', async () => {
      mockRepo.findDetailById.mockResolvedValue({
        result: { status: 'APPROVED' },
      } as any);
      await expect(service.approve('id', 'psy1')).rejects.toThrow(
        'result_already_approved',
      );
    });

    it('should throw 409 if RETURNED', async () => {
      mockRepo.findDetailById.mockResolvedValue({
        result: { status: 'RETURNED' },
      } as any);
      await expect(service.approve('id', 'psy1')).rejects.toThrow(
        'result_returned',
      );
    });

    it('should throw 422 if profile incomplete', async () => {
      mockRepo.findDetailById.mockResolvedValue({
        result: { status: 'PENDING_REVIEW' },
      } as any);
      mockRepo.findPsychologistProfile.mockResolvedValue(null);
      await expect(service.approve('id', 'psy1')).rejects.toThrow(
        'profile_incomplete',
      );
      mockRepo.findPsychologistProfile.mockResolvedValue({
        fullName: 'a',
        degree: '',
        licenseNumber: 'b',
        signatureImagePath: 'c',
      });
      await expect(service.approve('id', 'psy1')).rejects.toThrow(
        'profile_incomplete',
      );
    });

    it('should approve and return updated result on success', async () => {
      mockRepo.findDetailById.mockResolvedValue({
        result: { status: 'PENDING_REVIEW' },
      } as any);
      mockRepo.findPsychologistProfile.mockResolvedValue({
        fullName: 'Dr A',
        degree: 'M.Psi',
        licenseNumber: '123',
        signatureImagePath: '/uploads/a.png',
      });
      mockRepo.approve.mockResolvedValue({ count: 1 });
      mockRepo.findById.mockResolvedValue({
        id: 'r1',
        status: 'APPROVED',
      } as any);
      const result = await service.approve('r1', 'psy1');
      expect(result.status).toBe('APPROVED');
      expect(mockRepo.approve).toHaveBeenCalledWith(
        'r1',
        'psy1',
        expect.any(String),
      );
    });

    it('should retry on P2002 and handle concurrent race', async () => {
      mockRepo.findDetailById.mockResolvedValue({
        result: { status: 'PENDING_REVIEW' },
      } as any);
      mockRepo.findPsychologistProfile.mockResolvedValue({
        fullName: 'Dr A',
        degree: 'M.Psi',
        licenseNumber: '123',
        signatureImagePath: '/uploads/a.png',
      });
      const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
      mockRepo.approve
        .mockRejectedValueOnce(p2002)
        .mockResolvedValueOnce({ count: 1 });
      mockRepo.findById.mockResolvedValue({
        id: 'r1',
        status: 'APPROVED',
      } as any);
      const result = await service.approve('r1', 'psy1');
      expect(result.status).toBe('APPROVED');
      expect(mockRepo.approve).toHaveBeenCalledTimes(2);
    });

    it('should throw 409 on concurrent race count 0', async () => {
      mockRepo.findDetailById.mockResolvedValue({
        result: { status: 'PENDING_REVIEW' },
      } as any);
      mockRepo.findPsychologistProfile.mockResolvedValue({
        fullName: 'Dr A',
        degree: 'M.Psi',
        licenseNumber: '123',
        signatureImagePath: '/uploads/a.png',
      });
      mockRepo.approve.mockResolvedValue({ count: 0 });
      mockRepo.findById.mockResolvedValue({
        id: 'r1',
        status: 'APPROVED',
      } as never);
      await expect(service.approve('r1', 'psy1')).rejects.toThrow(
        'result_already_approved',
      );
    });
  });

  describe('returnForReason', () => {
    it('should throw 422 if reason <10', async () => {
      await expect(service.returnForReason('id', 'short')).rejects.toThrow(
        'validation_failed',
      );
    });

    it('should throw 404 if not found', async () => {
      mockRepo.findDetailById.mockResolvedValue(null);
      await expect(
        service.returnForReason('id', 'valid reason 10+'),
      ).rejects.toThrow('Result not found');
    });

    it('should throw 409 if not PENDING_REVIEW', async () => {
      mockRepo.findDetailById.mockResolvedValue({
        result: { status: 'APPROVED' },
      } as any);
      await expect(
        service.returnForReason('id', 'valid reason 10+'),
      ).rejects.toThrow('result_already_approved');
      mockRepo.findDetailById.mockResolvedValue({
        result: { status: 'RETURNED' },
      } as any);
      await expect(
        service.returnForReason('id', 'valid reason 10+'),
      ).rejects.toThrow('result_returned');
    });

    it('should return and update on success', async () => {
      mockRepo.findDetailById.mockResolvedValue({
        result: { status: 'PENDING_REVIEW' },
      } as any);
      mockRepo.returnForReason.mockResolvedValue({ count: 1 });
      mockRepo.findById.mockResolvedValue({
        id: 'r1',
        status: 'RETURNED',
      } as any);
      const result = await service.returnForReason('r1', 'valid reason 10+');
      expect(result.status).toBe('RETURNED');
    });
  });

  describe('applyCorrection', () => {
    it('should throw 422 if reason <10 or missing fields', async () => {
      await expect(
        service.applyCorrection(
          'id',
          { scores: {}, patternCode: '1', reason: 'short' },
          'psy1',
        ),
      ).rejects.toThrow('validation_failed');
      mockRepo.findDetailById.mockResolvedValue({
        result: { status: 'PENDING_REVIEW' },
      } as any);
      await expect(
        service.applyCorrection(
          'id',
          {
            scores: null,
            patternCode: '',
            reason: 'valid reason 10+',
          },
          'psy1',
        ),
      ).rejects.toThrow('validation_failed');
    });

    it('should throw 404 if not found', async () => {
      mockRepo.findDetailById.mockResolvedValue(null);
      await expect(
        service.applyCorrection(
          'id',
          { scores: {}, patternCode: '1', reason: 'valid reason 10+' },
          'psy1',
        ),
      ).rejects.toThrow('Result not found');
    });

    it('should throw 409 if APPROVED', async () => {
      mockRepo.findDetailById.mockResolvedValue({
        result: { status: 'APPROVED' },
      } as any);
      await expect(
        service.applyCorrection(
          'id',
          { scores: {}, patternCode: '1', reason: 'valid reason 10+' },
          'psy1',
        ),
      ).rejects.toThrow('result_already_approved');
    });

    it('should apply correction and return updated', async () => {
      mockRepo.findDetailById.mockResolvedValue({
        result: { status: 'PENDING_REVIEW' },
      } as any);
      mockRepo.applyCorrection.mockResolvedValue({ count: 1 });
      mockRepo.findById.mockResolvedValue({
        id: 'r1',
        status: 'PENDING_REVIEW',
      } as any);
      const result = await service.applyCorrection(
        'r1',
        { scores: { D: 1 }, patternCode: '1', reason: 'valid reason 10+' },
        'psy1',
      );
      expect(result.status).toBe('PENDING_REVIEW');
    });

    it('should throw 409 if correction race count 0', async () => {
      mockRepo.findDetailById.mockResolvedValue({
        result: { status: 'PENDING_REVIEW' },
      } as any);
      mockRepo.applyCorrection.mockResolvedValue({ count: 0 });
      await expect(
        service.applyCorrection(
          'r1',
          { scores: {}, patternCode: '1', reason: 'valid reason 10+' },
          'psy1',
        ),
      ).rejects.toThrow('result_already_approved');
    });
  });

  describe('resubmit', () => {
    it('should throw 404 if not found', async () => {
      mockRepo.findDetailById.mockResolvedValue(null);
      await expect(service.resubmit('id')).rejects.toThrow('Result not found');
    });

    it('should throw 409 if not RETURNED', async () => {
      mockRepo.findDetailById.mockResolvedValue({
        result: { status: 'PENDING_REVIEW' },
      } as any);
      await expect(service.resubmit('id')).rejects.toThrow('not_returned');
    });

    it('should resubmit on success', async () => {
      mockRepo.findDetailById.mockResolvedValue({
        result: { status: 'RETURNED' },
      } as any);
      mockRepo.resubmit.mockResolvedValue({ count: 1 });
      mockRepo.findById.mockResolvedValue({
        id: 'r1',
        status: 'PENDING_REVIEW',
      } as any);
      const result = await service.resubmit('r1');
      expect(result.status).toBe('PENDING_REVIEW');
    });

    it('should throw 409 if resubmit race count 0', async () => {
      mockRepo.findDetailById.mockResolvedValue({
        result: { status: 'RETURNED' },
      } as any);
      mockRepo.resubmit.mockResolvedValue({ count: 0 });
      await expect(service.resubmit('r1')).rejects.toThrow('not_returned');
    });
  });
});
