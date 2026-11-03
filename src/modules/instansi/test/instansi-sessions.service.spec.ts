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
  let mockInstitutionsRepo: { findByOwnerUserId: jest.Mock };
  let mockConfig: { get: jest.Mock };
  let mockParticipantsService: { resolveInstitutionId: jest.Mock };
  let mockSessionsService: { create: jest.Mock; close: jest.Mock };
  let mockInvoicesService: {
    createForSession: jest.Mock;
    findBySessionId: jest.Mock;
    regenerateAmount: jest.Mock;
  };
  let mockInvoicePaymentService: {
    isEnabled: jest.Mock;
    provision: jest.Mock;
    reprovision: jest.Mock;
  };

  const USER_ID = 'user-1';
  const INSTITUTION_ID = 'inst-1';
  const INSTITUTION_NAME = 'PT Contoh Sejahtera';
  const dto = {
    testIds: ['test-1'],
    slotLimit: 10,
    employeeIds: ['emp-1', 'emp-2'],
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
      update: jest.fn(),
      findSessionTestsBySessionId: jest.fn(),
      findParticipantByTokenHash: jest.fn(),
      findParticipantsBySessionId: jest.fn(),
      findAttemptsByParticipantId: jest.fn(),
      countResponsesByParticipantId: jest.fn(),
      countParticipants: jest.fn(),
      updateParticipantToken: jest.fn(),
      claimSeatWithAttempts: jest.fn(),
      joinSession: jest.fn(),
      createParticipants: jest.fn(),
      updateParticipant: jest.fn(),
      deleteParticipant: jest.fn(),
      resetParticipantToken: jest.fn(),
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
    mockInstitutionsRepo = {
      findByOwnerUserId: jest
        .fn()
        .mockResolvedValue({ id: INSTITUTION_ID, name: INSTITUTION_NAME }),
    };
    mockConfig = { get: jest.fn().mockReturnValue(30) };
    mockInvoicesService = {
      createForSession: jest.fn(),
      findBySessionId: jest.fn(),
      regenerateAmount: jest.fn(),
    };
    mockInvoicePaymentService = {
      isEnabled: jest.fn().mockReturnValue(true),
      provision: jest.fn().mockResolvedValue(null),
      reprovision: jest.fn().mockResolvedValue(null),
    };
    mockTestsRepo = {
      findMany: jest.fn().mockResolvedValue({
        data: [{ id: 'test-1', slug: 'cpmi', name: 'CPMI', price: 50000 }],
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
      mockInstitutionsRepo as never,
      mockParticipantsService as never,
      mockSessionsService as never,
      mockInvoicesService as never,
      mockInvoicePaymentService as never,
      mockConfig as never,
    );
  });

  describe('create', () => {
    const issuedExpiry = new Date('2026-11-17T00:00:00Z');

    it('creates a PENDING_PAYMENT batch + invoice billed per slot, roster from employees', async () => {
      mockParticipantsRepo.findManyByIds.mockResolvedValue(employees as never);
      mockSessionsService.create.mockResolvedValue({
        id: 's1',
        expiresAt: issuedExpiry,
      });
      mockInvoicesService.createForSession.mockResolvedValue({
        id: 'inv1',
        number: 'INV-2026-0001',
        amount: 500000,
        status: 'UNPAID',
        vaNumber: null,
        vaBankCode: null,
        expiresAt: issuedExpiry,
      });

      const result = await service.create(USER_ID, dto);

      expect(result.invoice.id).toBe('inv1');
      expect(mockSessionsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          institutionId: INSTITUTION_ID,
          testIds: dto.testIds,
          slotLimit: dto.slotLimit,
          status: 'PENDING_PAYMENT',
          roster: [
            { name: 'Budi Santoso', institutionParticipantId: 'emp-1' },
            { name: 'Siti Rahayu', institutionParticipantId: 'emp-2' },
          ],
        }),
        USER_ID,
      );
      // 50000 per test × 10 slots bought up front
      expect(mockInvoicesService.createForSession).toHaveBeenCalledWith(
        expect.objectContaining({
          institutionId: INSTITUTION_ID,
          sessionId: 's1',
          amount: 500000,
        }),
      );
      const provisionTitle = mockInvoicePaymentService.provision.mock
        .calls[0] as unknown as [string, string];
      expect(provisionTitle[1]).toContain('CPMI');
      expect(provisionTitle[1]).toContain(INSTITUTION_NAME);
    });

    it('allows an empty roster (names are filled later from the dashboard)', async () => {
      mockParticipantsRepo.findManyByIds.mockResolvedValue([] as never);
      mockSessionsService.create.mockResolvedValue({ id: 's1' });
      mockInvoicesService.createForSession.mockResolvedValue({ id: 'inv1' });

      await service.create(USER_ID, {
        testIds: ['test-1'],
        slotLimit: 10,
        employeeIds: [],
      });

      expect(mockSessionsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ roster: [] }),
        USER_ID,
      );
      expect(mockInvoicesService.createForSession).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 500000 }),
      );
    });

    it('fills a default title and a future expiry from the configured TTL', async () => {
      mockParticipantsRepo.findManyByIds.mockResolvedValue([] as never);
      let createArgs: { title: string; expiresAt: Date } | undefined;
      mockSessionsService.create.mockImplementation(
        (args: { title: string; expiresAt: Date }) => {
          createArgs = args;
          return Promise.resolve({ id: 's1' });
        },
      );
      mockInvoicesService.createForSession.mockResolvedValue({ id: 'inv1' });

      const before = Date.now();
      await service.create(USER_ID, { ...dto, employeeIds: [] });

      expect(createArgs?.title).toContain('CPMI');
      expect(createArgs?.title).toContain(INSTITUTION_NAME);
      const ttlMs = 30 * 24 * 60 * 60 * 1000;
      const expiresMs = (createArgs as { expiresAt: Date }).expiresAt.getTime();
      expect(expiresMs).toBeGreaterThanOrEqual(before + ttlMs - 5000);
      expect(expiresMs).toBeLessThanOrEqual(Date.now() + ttlMs + 5000);
    });

    it('fails fast with 503 when no VA gateway is configured', async () => {
      mockInvoicePaymentService.isEnabled.mockReturnValue(false);

      await expect(service.create(USER_ID, dto)).rejects.toThrow(
        'payment_gateway_unavailable',
      );
      expect(mockSessionsService.create).not.toHaveBeenCalled();
      expect(mockInvoicesService.createForSession).not.toHaveBeenCalled();
    });

    it('prices the batch as the sum of test prices times the slot count', async () => {
      mockParticipantsRepo.findManyByIds.mockResolvedValue(employees as never);
      mockTestsRepo.findMany.mockResolvedValue({
        data: [
          { id: 'test-1', slug: 'cpmi', name: 'CPMI', price: 50000 },
          { id: 'test-2', slug: 'other', name: 'Other', price: 25000 },
        ],
        total: 2,
      });
      mockSessionsService.create.mockResolvedValue({ id: 's1' });
      mockInvoicesService.createForSession.mockResolvedValue({ id: 'inv1' });

      await service.create(USER_ID, {
        ...dto,
        testIds: ['test-1', 'test-2'],
      });

      // (50000 + 25000) × 10 slots
      expect(mockInvoicesService.createForSession).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 750000 }),
      );
    });

    it('only sells published tests', async () => {
      mockTestsRepo.findMany.mockResolvedValue({ data: [], total: 0 });

      await expect(service.create(USER_ID, dto)).rejects.toThrow(
        'validation_failed',
      );

      expect(mockTestsRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: dto.testIds }, status: 'PUBLISHED' },
        }),
      );
      expect(mockSessionsService.create).not.toHaveBeenCalled();
    });

    it('refuses a batch whose test price is not set', async () => {
      mockTestsRepo.findMany.mockResolvedValue({
        data: [{ id: 'test-1', slug: 'wpt', name: 'WPT', price: 0 }],
        total: 1,
      });

      await expect(service.create(USER_ID, dto)).rejects.toThrow(
        'validation_failed',
      );

      expect(mockSessionsService.create).not.toHaveBeenCalled();
      expect(mockInvoicesService.createForSession).not.toHaveBeenCalled();
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

      await expect(service.create(USER_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockSessionsService.create).not.toHaveBeenCalled();
    });

    it('throws 404 when the caller has no institution', async () => {
      mockInstitutionsRepo.findByOwnerUserId.mockResolvedValue(null);

      await expect(service.create(USER_ID, dto)).rejects.toThrow(
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

    it('returns detail for own session with its invoice', async () => {
      const invoice = {
        id: 'inv1',
        number: 'INV-1',
        amount: 300000,
        status: 'UNPAID',
        sessionId: 's1',
        vaNumber: null,
        vaBankCode: null,
        expiresAt: null,
      };
      mockSessionsRepo.findDetailById.mockResolvedValue({
        session: { id: 's1', institutionId: INSTITUTION_ID },
        participants: [],
      } as never);
      mockInvoicesService.findBySessionId.mockResolvedValue(invoice);

      const result = await service.getDetail(USER_ID, 's1');

      expect(result.session).toEqual({
        id: 's1',
        institutionId: INSTITUTION_ID,
      });
      // getDetail has no joined session row, so the list-only fields stay null.
      expect(result.invoice).toEqual({
        ...invoice,
        sessionTitle: null,
        slotLimit: null,
      });
    });

    it('returns a null invoice when none is provisioned', async () => {
      mockSessionsRepo.findDetailById.mockResolvedValue({
        session: { id: 's1', institutionId: INSTITUTION_ID },
        participants: [],
      } as never);
      mockInvoicesService.findBySessionId.mockResolvedValue(null);

      const result = await service.getDetail(USER_ID, 's1');

      expect(result.invoice).toBeNull();
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

  describe('roster edits (paid batch, invoice untouched)', () => {
    const batchSession = {
      id: 's1',
      institutionId: INSTITUTION_ID,
      slotLimit: 10,
      title: 'Sesi Rekrutmen 1',
      status: 'ACTIVE',
    };
    const invoice = {
      id: 'inv1',
      number: 'INV-1',
      status: 'UNPAID',
      amount: 500000,
      vaNumber: '880777',
      vaBankCode: '014',
      sessionId: 's1',
      expiresAt: new Date('2026-09-01T02:00:00Z'),
    };

    const givenBatch = () => {
      mockSessionsRepo.findById.mockResolvedValue(batchSession as never);
      mockInvoicesService.findBySessionId.mockResolvedValue(invoice);
    };

    beforeEach(givenBatch);

    it('adds participants and leaves the prepaid invoice untouched', async () => {
      mockSessionsRepo.findParticipantsBySessionId.mockResolvedValue([
        { id: 'p1', institutionParticipantId: 'emp-1', name: 'A' },
        { id: 'p2', institutionParticipantId: 'emp-2', name: 'B' },
      ] as never);
      mockParticipantsRepo.findManyByIds.mockResolvedValue([
        { id: 'emp-3', name: 'C' },
      ] as never);

      const result = await service.addParticipants(USER_ID, 's1', {
        employeeIds: ['emp-3'],
      });

      expect(mockSessionsRepo.createParticipants).toHaveBeenCalledWith('s1', [
        { name: 'C', institutionParticipantId: 'emp-3' },
      ]);
      expect(mockInvoicesService.regenerateAmount).not.toHaveBeenCalled();
      expect(mockInvoicePaymentService.reprovision).not.toHaveBeenCalled();
      expect(result.amount).toBe(500000);
      expect(result.vaNumber).toBe('880777');
    });

    it('adds participants after the invoice is PAID (no batch_locked)', async () => {
      mockInvoicesService.findBySessionId.mockResolvedValue({
        ...invoice,
        status: 'PAID',
      });
      mockSessionsRepo.findParticipantsBySessionId.mockResolvedValue([
        { id: 'p1', institutionParticipantId: 'emp-1', name: 'A' },
      ] as never);
      mockParticipantsRepo.findManyByIds.mockResolvedValue([
        { id: 'emp-3', name: 'C' },
      ] as never);

      const result = await service.addParticipants(USER_ID, 's1', {
        employeeIds: ['emp-3'],
      });

      expect(mockSessionsRepo.createParticipants).toHaveBeenCalled();
      expect(result.amount).toBe(500000);
    });

    it('rejects adding beyond slotLimit with 422 and no change', async () => {
      mockSessionsRepo.findById.mockResolvedValue({
        ...batchSession,
        slotLimit: 2,
      } as never);
      mockSessionsRepo.findParticipantsBySessionId.mockResolvedValue([
        { id: 'p1', institutionParticipantId: 'emp-1', name: 'A' },
        { id: 'p2', institutionParticipantId: 'emp-2', name: 'B' },
      ] as never);

      await expect(
        service.addParticipants(USER_ID, 's1', { employeeIds: ['emp-3'] }),
      ).rejects.toThrow('validation_failed');
      expect(mockSessionsRepo.createParticipants).not.toHaveBeenCalled();
    });

    it('removes a participant without touching the invoice', async () => {
      mockSessionsRepo.findParticipantsBySessionId.mockResolvedValue([
        { id: 'p1', institutionParticipantId: 'emp-1', name: 'A' },
        { id: 'p2', institutionParticipantId: 'emp-2', name: 'B' },
        { id: 'p3', institutionParticipantId: 'emp-3', name: 'C' },
      ] as never);

      const result = await service.removeParticipant(USER_ID, 's1', 'p3');

      expect(mockSessionsRepo.deleteParticipant).toHaveBeenCalledWith('p3');
      expect(mockInvoicesService.regenerateAmount).not.toHaveBeenCalled();
      expect(result.amount).toBe(500000);
    });

    it('swaps the seat employee without changing the amount', async () => {
      mockSessionsRepo.findParticipantsBySessionId.mockResolvedValue([
        { id: 'p1', institutionParticipantId: 'emp-1', name: 'A' },
      ] as never);
      mockParticipantsRepo.findManyByIds.mockResolvedValue([
        { id: 'emp-9', name: 'Z' },
      ] as never);

      await service.swapParticipant(USER_ID, 's1', 'p1', {
        employeeId: 'emp-9',
      });

      expect(mockSessionsRepo.updateParticipant).toHaveBeenCalledWith('p1', {
        name: 'Z',
        institutionParticipantId: 'emp-9',
      });
      expect(mockInvoicesService.regenerateAmount).not.toHaveBeenCalled();
    });

    it('resets the seat lock for a seat owned by the caller institution', async () => {
      mockSessionsRepo.findParticipantsBySessionId.mockResolvedValue([
        { id: 'p1', institutionParticipantId: 'emp-1', name: 'A' },
      ] as never);
      mockSessionsRepo.resetParticipantToken.mockResolvedValue({
        id: 'p1',
        name: 'A',
        candidateNumber: '3',
        tokenHash: null,
      } as never);

      const result = await service.resetParticipant(USER_ID, 's1', 'p1');

      expect(mockSessionsRepo.resetParticipantToken).toHaveBeenCalledWith('p1');
      expect(result).toEqual({
        id: 'p1',
        name: 'A',
        candidateNumber: '3',
        claimed: false,
      });
    });

    it('404s reset for another institution session without touching the seat', async () => {
      mockSessionsRepo.findById.mockResolvedValue({
        ...batchSession,
        institutionId: 'other-inst',
      } as never);

      await expect(
        service.resetParticipant(USER_ID, 's1', 'p1'),
      ).rejects.toThrow(NotFoundException);
      expect(mockSessionsRepo.resetParticipantToken).not.toHaveBeenCalled();
    });

    it('404s when the batch belongs to another institution', async () => {
      mockSessionsRepo.findById.mockResolvedValue({
        ...batchSession,
        institutionId: 'other-inst',
      } as never);

      await expect(
        service.addParticipants(USER_ID, 's1', { employeeIds: ['emp-3'] }),
      ).rejects.toThrow(NotFoundException);
      expect(mockSessionsRepo.createParticipants).not.toHaveBeenCalled();
    });

    it('rejects every roster edit while the batch is still unpaid', async () => {
      mockSessionsRepo.findById.mockResolvedValue({
        ...batchSession,
        status: 'PENDING_PAYMENT',
      } as never);

      await expect(
        service.addParticipants(USER_ID, 's1', { employeeIds: ['emp-3'] }),
      ).rejects.toThrow('session_unpaid');
      await expect(
        service.swapParticipant(USER_ID, 's1', 'p1', { employeeId: 'emp-9' }),
      ).rejects.toThrow('session_unpaid');
      await expect(
        service.removeParticipant(USER_ID, 's1', 'p1'),
      ).rejects.toThrow('session_unpaid');
      await expect(
        service.resetParticipant(USER_ID, 's1', 'p1'),
      ).rejects.toThrow('session_unpaid');

      expect(mockSessionsRepo.createParticipants).not.toHaveBeenCalled();
      expect(mockSessionsRepo.updateParticipant).not.toHaveBeenCalled();
      expect(mockSessionsRepo.deleteParticipant).not.toHaveBeenCalled();
      expect(mockSessionsRepo.resetParticipantToken).not.toHaveBeenCalled();
    });
  });
});
