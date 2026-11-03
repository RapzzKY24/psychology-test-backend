/* eslint-disable @typescript-eslint/unbound-method */
import { InvoicesService } from '../service/invoices.service';
import type { InvoicesRepository } from '../repository/invoices.repository';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let mockRepo: jest.Mocked<InvoicesRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findBillingContact: jest.fn(),
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
    service = new InvoicesService(mockRepo, {
      get: (_key: string, fallback?: unknown) => fallback,
    } as never);
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
      await expect(service.findById('id')).rejects.toThrow('invoice_not_found');
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

    it('gives the invoice its own payment window, not the session TTL', async () => {
      mockRepo.institutionExists.mockResolvedValue(true);
      mockRepo.createForSession.mockResolvedValue({ id: 'inv1' } as never);

      const before = Date.now();
      await service.createForSession({
        institutionId: 'inst1',
        amount: 300000,
        sessionId: 'sess1',
      });

      const passed = mockRepo.createForSession.mock.calls[0][0] as unknown as {
        expiresAt: Date;
      };
      const windowMs = passed.expiresAt.getTime() - before;
      // 1440 minutes by default — a day, not the 30-day session TTL.
      expect(windowMs).toBeGreaterThan(1439 * 60_000);
      expect(windowMs).toBeLessThanOrEqual(1440 * 60_000 + 5_000);
    });

    it('keeps an explicit expiry when the caller passes one', async () => {
      mockRepo.institutionExists.mockResolvedValue(true);
      mockRepo.createForSession.mockResolvedValue({ id: 'inv1' } as never);
      const explicit = new Date('2027-01-01T00:00:00Z');

      await service.createForSession({
        institutionId: 'inst1',
        amount: 300000,
        sessionId: 'sess1',
        expiresAt: explicit,
      });

      expect(mockRepo.createForSession).toHaveBeenCalledWith(
        expect.objectContaining({ expiresAt: explicit }),
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
        'invoice_not_found',
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
  describe('verify', () => {
    const row = {
      number: 'INV/2026/10/001',
      amount: 1500000,
      status: 'UNPAID' as const,
      issuedAt: new Date('2026-10-28T03:00:00.000Z'),
      dueDate: new Date('2026-11-04T03:00:00.000Z'),
      verifiedAt: null,
      vaNumber: '8808123456789012',
      vaBankCode: 'BCA',
      institution: { name: 'PT Contoh Sejahtera' },
    };

    it('should throw 404 for an unknown token', async () => {
      mockRepo.findByVerificationToken.mockResolvedValue(null);
      await expect(service.verify('nope')).rejects.toThrow('invoice_not_found');
    });

    it('should expose the VA while the invoice is still unpaid', async () => {
      mockRepo.findByVerificationToken.mockResolvedValue(row);

      const result = await service.verify('token');

      expect(result.payment).toEqual({
        bank: 'BCA',
        vaNumber: '8808123456789012',
      });
      expect(result.paidAt).toBeNull();
    });

    it('should hide the VA and expose paidAt once the invoice is paid', async () => {
      mockRepo.findByVerificationToken.mockResolvedValue({
        ...row,
        status: 'PAID',
        verifiedAt: new Date('2026-10-29T02:00:00.000Z'),
      });

      const result = await service.verify('token');

      expect(result.payment).toBeNull();
      expect(result.paidAt).toEqual(new Date('2026-10-29T02:00:00.000Z'));
    });

    it('should omit payment when the invoice has no VA', async () => {
      mockRepo.findByVerificationToken.mockResolvedValue({
        ...row,
        vaNumber: null,
        vaBankCode: null,
      });

      const result = await service.verify('token');

      expect(result.payment).toBeNull();
    });

    it('should not leak payment tokens, notes or contact email', async () => {
      mockRepo.findByVerificationToken.mockResolvedValue(row);

      const result = await service.verify('token');

      expect(Object.keys(result).sort()).toEqual([
        'amount',
        'dueDate',
        'institutionName',
        'issuedAt',
        'number',
        'paidAt',
        'payment',
        'status',
      ]);
    });
  });
});
