/* eslint-disable @typescript-eslint/unbound-method */
import { InvoicesService } from '../service/invoices.service';
import type { InvoicesRepository } from '../repository/invoices.repository';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let mockRepo: jest.Mocked<InvoicesRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByVerificationToken: jest.fn(),
      findForPdf: jest.fn(),
      findDetailById: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      institutionExists: jest.fn(),
      createNextNumbered: jest.fn(),
      createForSession: jest.fn(),
      findBySessionId: jest.fn(),
      confirmPaymentWithActivation: jest.fn(),
      regenerateAmount: jest.fn(),
      findByProviderOrderId: jest.fn(),
      findUnpaidWithoutProviderOrderId: jest.fn(),
      findUnsettledInvoices: jest.fn(),
      findOwnedByRef: jest.fn(),
      findByInstitution: jest.fn(),
    };
    service = new InvoicesService(mockRepo);
  });

  describe('create', () => {
    it('should throw 404 if institution not found', async () => {
      mockRepo.institutionExists.mockResolvedValue(false);
      await expect(
        service.create({ institutionId: 'inst1', amount: 1000 }),
      ).rejects.toThrow('Institution not found');
      expect(mockRepo.createNextNumbered).not.toHaveBeenCalled();
    });

    it('should delegate numbering to the repository with the current year', async () => {
      mockRepo.institutionExists.mockResolvedValue(true);
      mockRepo.createNextNumbered.mockResolvedValue({
        id: 'inv1',
        number: 'INV-2026-0006',
        amount: 1000,
      } as never);

      const result = await service.create({
        institutionId: 'inst1',
        amount: 1000,
      });
      expect(result.number).toBe('INV-2026-0006');
      expect(mockRepo.createNextNumbered).toHaveBeenCalledWith(
        expect.objectContaining({
          institutionId: 'inst1',
          amount: 1000,
          year: new Date().getFullYear(),
        }),
      );
    });
  });

  describe('findMany', () => {
    it('should filter by institution and status with pagination', async () => {
      mockRepo.findMany.mockResolvedValue({
        data: [{ id: '1' } as never],
        total: 1,
      });
      const result = await service.findMany({
        page: 1,
        limit: 10,
        institutionId: 'inst1',
        status: 'PAID',
      });
      expect(result.total).toBe(1);
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { institutionId: 'inst1', status: 'PAID' },
          skip: 0,
          take: 10,
        }),
      );
    });
  });

  describe('findById', () => {
    it('should throw 404 if not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findById('id')).rejects.toThrow('Invoice not found');
    });
  });

  describe('createForSession', () => {
    it('should 404 when the institution is missing', async () => {
      mockRepo.institutionExists.mockResolvedValue(false);
      await expect(
        service.createForSession({
          institutionId: 'inst1',
          amount: 1000,
          sessionId: 'sess1',
        }),
      ).rejects.toThrow('Institution not found');
      expect(mockRepo.createForSession).not.toHaveBeenCalled();
    });

    it('should delegate a session-linked invoice to the repository', async () => {
      mockRepo.institutionExists.mockResolvedValue(true);
      mockRepo.createForSession.mockResolvedValue({
        id: 'inv1',
        sessionId: 'sess1',
      } as never);

      const result = await service.createForSession({
        institutionId: 'inst1',
        amount: 300000,
        sessionId: 'sess1',
      });
      expect(result.sessionId).toBe('sess1');
      expect(mockRepo.createForSession).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'sess1', amount: 300000 }),
      );
    });
  });

  describe('confirmPaymentWithActivation', () => {
    it('should pass the settlement params through to the repository', async () => {
      mockRepo.confirmPaymentWithActivation.mockResolvedValue({
        outcome: 'confirmed',
        invoice: { id: 'inv1', status: 'PAID' },
      } as never);

      const result = await service.confirmPaymentWithActivation('inv1', {
        paidAmount: 300000,
        verifiedBySource: 'JOKUL',
      });

      expect(result.outcome).toBe('confirmed');
      expect(mockRepo.confirmPaymentWithActivation).toHaveBeenCalledWith(
        'inv1',
        { paidAmount: 300000, verifiedBySource: 'JOKUL' },
      );
    });
  });

  describe('updateStatus', () => {
    it('should throw 404 if not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.updateStatus('id', 'PAID')).rejects.toThrow(
        'Invoice not found',
      );
    });

    it('should update status', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'inv1',
        status: 'UNPAID',
      } as never);
      mockRepo.update.mockResolvedValue({
        id: 'inv1',
        status: 'PAID',
      } as never);
      const result = await service.updateStatus('inv1', 'PAID');
      expect(result.status).toBe('PAID');
    });
  });
});
