/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import { InstansiSessionsService } from '../service/instansi-sessions.service';
import type { SessionsRepository } from '../../sessions/repository/sessions.repository';
import type { InstansiParticipantsRepository } from '../repository/instansi-participants.repository';

describe('InstansiSessionsService', () => {
  let service: InstansiSessionsService;
  let mockSessionsRepo: jest.Mocked<SessionsRepository>;
  let mockParticipantsRepo: jest.Mocked<InstansiParticipantsRepository>;
  let mockParticipantsService: { resolveInstitutionId: jest.Mock };
  let mockSessionsService: { create: jest.Mock; close: jest.Mock };

  const USER_ID = 'user-1';
  const INSTITUTION_ID = 'inst-1';
  const dto = {
    title: 'Sesi Rekrutmen 1',
    testIds: ['test-1'],
    employeeIds: ['emp-1', 'emp-2'],
    slotLimit: 10,
    expiresAt: new Date(Date.now() + 3600_000),
    pin: undefined,
  };

  const employees = [
    { id: 'emp-1', institutionId: INSTITUTION_ID, name: 'Budi Santoso' },
    { id: 'emp-2', institutionId: INSTITUTION_ID, name: 'Siti Rahayu' },
  ];

  beforeEach(() => {
    mockSessionsRepo = {
      findById: jest.fn(),
      findDetailById: jest.fn(),
      findMany: jest.fn(),
      findManyByInstitution: jest.fn(),
      countSessionsByInstitution: jest.fn(),
      getAttemptStatsByInstitution: jest.fn(),
      findByToken: jest.fn(),
      findTestsByIds: jest.fn(),
      findInstitutionById: jest.fn(),
      createWithTests: jest.fn(),
      updateStatus: jest.fn(),
      findSessionTestsBySessionId: jest.fn(),
      findParticipantByTokenHash: jest.fn(),
      findParticipantsBySessionId: jest.fn(),
      findAttemptsByParticipantId: jest.fn(),
      countResponsesByParticipantId: jest.fn(),
      countParticipants: jest.fn(),
      updateParticipantToken: jest.fn(),
      joinSession: jest.fn(),
    };
    mockParticipantsRepo = {
      findMany: jest.fn(),
      findById: jest.fn(),
      findManyByIds: jest.fn(),
      findByIdNumber: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    mockParticipantsService = { resolveInstitutionId: jest.fn() };
    mockSessionsService = { create: jest.fn(), close: jest.fn() };
    mockParticipantsService.resolveInstitutionId.mockResolvedValue(
      INSTITUTION_ID,
    );
    service = new InstansiSessionsService(
      mockSessionsRepo,
      mockParticipantsRepo,
      mockParticipantsService as never,
      mockSessionsService as never,
    );
  });

  describe('create', () => {
    it('creates a ROSTER session scoped to the caller institution', async () => {
      mockParticipantsRepo.findManyByIds.mockResolvedValue(employees as never);
      mockSessionsService.create.mockResolvedValue({ id: 's1' });

      const result = await service.create(USER_ID, dto);

      expect(result).toEqual({ id: 's1' });
      expect(mockSessionsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: dto.title,
          institutionId: INSTITUTION_ID,
          testIds: dto.testIds,
          roster: [
            { name: 'Budi Santoso', institutionParticipantId: 'emp-1' },
            { name: 'Siti Rahayu', institutionParticipantId: 'emp-2' },
          ],
        }),
        USER_ID,
      );
    });

    it('throws 404 when an employee belongs to another institution', async () => {
      mockParticipantsRepo.findManyByIds.mockResolvedValue([
        employees[0],
      ] as never);

      await expect(service.create(USER_ID, dto as never)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockSessionsService.create).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('lists only the caller institution sessions with meta', async () => {
      mockSessionsRepo.findManyByInstitution.mockResolvedValue({
        data: [{ id: 's1' }] as never,
        total: 1,
      });

      const result = await service.list(USER_ID, { page: 1, limit: 10 });

      expect(mockSessionsRepo.findManyByInstitution).toHaveBeenCalledWith(
        INSTITUTION_ID,
        { skip: 0, take: 10 },
      );
      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });
  });

  describe('getDetail', () => {
    it('throws 404 for another institution session', async () => {
      mockSessionsRepo.findById.mockResolvedValue({
        id: 's1',
        institutionId: 'other-inst',
      } as never);

      await expect(service.getDetail(USER_ID, 's1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockSessionsRepo.findDetailById).not.toHaveBeenCalled();
    });

    it('returns detail for own session', async () => {
      mockSessionsRepo.findById.mockResolvedValue({
        id: 's1',
        institutionId: INSTITUTION_ID,
      } as never);
      mockSessionsRepo.findDetailById.mockResolvedValue({
        session: { id: 's1' },
      } as never);

      const result = await service.getDetail(USER_ID, 's1');

      expect(result).toEqual({ session: { id: 's1' } });
    });
  });

  describe('close', () => {
    it('throws 404 for another institution session', async () => {
      mockSessionsRepo.findById.mockResolvedValue({
        id: 's1',
        institutionId: 'other-inst',
      } as never);

      await expect(service.close(USER_ID, 's1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockSessionsService.close).not.toHaveBeenCalled();
    });

    it('closes own session', async () => {
      mockSessionsRepo.findById.mockResolvedValue({
        id: 's1',
        institutionId: INSTITUTION_ID,
      } as never);
      mockSessionsService.close.mockResolvedValue({
        id: 's1',
        status: 'CLOSED',
      });

      const result = await service.close(USER_ID, 's1');

      expect(mockSessionsService.close).toHaveBeenCalledWith('s1');
      expect(result).toEqual({ id: 's1', status: 'CLOSED' });
    });
  });
});
