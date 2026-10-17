/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import { InstansiSessionsService } from '../service/instansi-sessions.service';
import type { SessionsRepository } from '../../sessions/repository/sessions.repository';
import type { InstansiParticipantsRepository } from '../repository/instansi-participants.repository';

describe('InstansiSessionsService', () => {
  let service: InstansiSessionsService;
  let mockSessionsRepo: jest.Mocked<SessionsRepository>;
  let mockParticipantsRepo: jest.Mocked<InstansiParticipantsRepository>;
  let mockTestsRepo: { findMany: jest.Mock };
  let mockParticipantsService: { resolveInstitutionId: jest.Mock };
  let mockSessionsService: { create: jest.Mock; close: jest.Mock };
  let mockInvoicesService: { createForSession: jest.Mock };

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
      claimSeatWithAttempts: jest.fn(),
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
    mockInvoicesService = { createForSession: jest.fn() };
    mockTestsRepo = {
      findMany: jest.fn().mockResolvedValue({
        data: [{ slug: 'cpmi', price: 50000 }],
        total: 1,
      }),
    };
    mockParticipantsService.resolveInstitutionId.mockResolvedValue(
      INSTITUTION_ID,
    );
    service = new InstansiSessionsService(
      mockSessionsRepo,
      mockParticipantsRepo,
      mockTestsRepo as never,
      mockParticipantsService as never,
      mockSessionsService as never,
      mockInvoicesService as never,
    );
  });

  describe('create', () => {
    it('creates a PENDING_PAYMENT ROSTER session + invoice scoped to the caller institution', async () => {
      mockParticipantsRepo.findManyByIds.mockResolvedValue(employees as never);
      mockSessionsService.create.mockResolvedValue({
        id: 's1',
        expiresAt: dto.expiresAt,
      });
      mockInvoicesService.createForSession.mockResolvedValue({
        id: 'inv1',
        number: 'INV-2026-0001',
        amount: 100000,
        status: 'UNPAID',
        vaNumber: null,
        vaBankCode: null,
        expiresAt: dto.expiresAt,
      });

      const result = await service.create(USER_ID, dto);

      expect(result.session).toEqual({ id: 's1', expiresAt: dto.expiresAt });
      expect(result.invoice.id).toBe('inv1');
      expect(mockSessionsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: dto.title,
          institutionId: INSTITUTION_ID,
          testIds: dto.testIds,
          status: 'PENDING_PAYMENT',
          roster: [
            { name: 'Budi Santoso', institutionParticipantId: 'emp-1' },
            { name: 'Siti Rahayu', institutionParticipantId: 'emp-2' },
          ],
        }),
        USER_ID,
      );
      // 50000 per test × 2 employees
      expect(mockInvoicesService.createForSession).toHaveBeenCalledWith(
        expect.objectContaining({
          institutionId: INSTITUTION_ID,
          sessionId: 's1',
          amount: 100000,
        }),
      );
    });

    it('prices the batch as the sum of test prices times the seat count', async () => {
      mockParticipantsRepo.findManyByIds.mockResolvedValue(employees as never);
      mockTestsRepo.findMany.mockResolvedValue({
        data: [
          { slug: 'cpmi', price: 50000 },
          { slug: 'other', price: 25000 },
        ],
        total: 2,
      });
      mockSessionsService.create.mockResolvedValue({ id: 's1' });
      mockInvoicesService.createForSession.mockResolvedValue({ id: 'inv1' });

      await service.create(USER_ID, {
        ...dto,
        testIds: ['test-1', 'test-2'],
      });

      expect(mockInvoicesService.createForSession).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 150000 }),
      );
    });

    it('throws 422 when employees exceed slotLimit', async () => {
      await expect(
        service.create(USER_ID, { ...dto, slotLimit: 1 }),
      ).rejects.toThrow('validation_failed');
      expect(mockParticipantsRepo.findManyByIds).not.toHaveBeenCalled();
      expect(mockSessionsService.create).not.toHaveBeenCalled();
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
      mockSessionsRepo.findDetailById.mockResolvedValue({
        session: { id: 's1', institutionId: 'other-inst' },
      } as never);

      await expect(service.getDetail(USER_ID, 's1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockSessionsRepo.findById).not.toHaveBeenCalled();
    });

    it('returns detail for own session', async () => {
      mockSessionsRepo.findDetailById.mockResolvedValue({
        session: { id: 's1', institutionId: INSTITUTION_ID },
      } as never);

      const result = await service.getDetail(USER_ID, 's1');

      expect(result).toEqual({
        session: { id: 's1', institutionId: INSTITUTION_ID },
      });
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
