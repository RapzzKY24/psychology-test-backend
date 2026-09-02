/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method */
jest.mock('../utils/hash-pin', () => ({
  hashPin: jest.fn().mockResolvedValue('hashed-pin'),
}));

import { SessionsService } from '../service/sessions.service';
import type { SessionsRepository } from '../repository/sessions.repository';
import { hashPin } from '../utils/hash-pin';

describe('SessionsService', () => {
  let service: SessionsService;
  let mockRepo: jest.Mocked<SessionsRepository>;

  const adminId = '00000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findDetailById: jest.fn(),
      findMany: jest.fn(),
      findByToken: jest.fn(),
      findTestsByIds: jest.fn(),
      findInstitutionById: jest.fn(),
      createWithTests: jest.fn(),
      updateStatus: jest.fn(),
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
        participants: 3,
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
});
