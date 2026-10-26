/* eslint-disable @typescript-eslint/unbound-method */
import { InternalServerErrorException } from '@nestjs/common';
import { OrdersService } from '../service/orders.service';
import type { OrdersRepository } from '../repository/orders.repository';

describe('OrdersService', () => {
  let service: OrdersService;
  let mockRepo: jest.Mocked<OrdersRepository>;
  let mockConfig: { get: jest.Mock };
  let mockOrderPayment: {
    isEnabled: jest.Mock;
    createPaymentOrder: jest.Mock;
    reprovision: jest.Mock;
  };

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findPendingOrPaidByAmount: jest.fn(),
      findTestById: jest.fn(),
      getQrisImageUrl: jest.fn(),
      expireStalePending: jest.fn(),
      create: jest.fn(),
      createWithUniqueCheck: jest.fn(),
      update: jest.fn(),
      updateClaimIfUnset: jest.fn(),
      cancelPayment: jest.fn(),
      verifyPayment: jest.fn(),
      confirmExternalPayment: jest.fn(),
      findByProviderOrderId: jest.fn(),
      findUnsettledOrders: jest.fn(),
      findPendingOrdersWithoutProviderOrderId: jest.fn(),
      updateManyToExpired: jest.fn(),
      findMany: jest.fn(),
      findManyEnriched: jest.fn(),
    };
    mockConfig = { get: jest.fn().mockReturnValue(60) };
    mockOrderPayment = {
      isEnabled: jest.fn().mockReturnValue(false),
      createPaymentOrder: jest.fn(),
      reprovision: jest.fn(),
    };
    service = new OrdersService(
      mockRepo,
      mockConfig as never,
      mockOrderPayment as never,
    );
  });

  describe('create', () => {
    it('should create order with unique code and total', async () => {
      mockRepo.findTestById.mockResolvedValue({
        id: 't1',
        price: 200000,
        status: 'PUBLISHED',
      } as never);
      mockRepo.createWithUniqueCheck.mockResolvedValue({
        id: 'o1',
        basePrice: 200000,
        uniqueCode: 123,
        amount: 200123,
        expiresAt: new Date(),
      } as never);
      mockRepo.getQrisImageUrl.mockResolvedValue(null);

      const result = await service.create('t1', 'u1');
      expect(result.basePrice).toBe(200000);
      expect(result.uniqueCode).toBeGreaterThanOrEqual(1);
      expect(result.uniqueCode).toBeLessThanOrEqual(999);
      expect(result.amount).toBe(result.basePrice + result.uniqueCode);
    });

    it('returns null payment url and token for a manual order', async () => {
      mockRepo.findTestById.mockResolvedValue({
        id: 't1',
        price: 200000,
        status: 'PUBLISHED',
      } as never);
      mockRepo.createWithUniqueCheck.mockResolvedValue({
        id: 'o1',
        basePrice: 200000,
        uniqueCode: 123,
        amount: 200123,
        expiresAt: new Date(),
      } as never);
      mockRepo.getQrisImageUrl.mockResolvedValue(null);

      const result = await service.create('t1', 'u1');

      expect(result.paymentProvider).toBe('MANUAL_QRIS');
      expect(result.paymentUrl).toBeNull();
      expect(result.paymentToken).toBeNull();
    });

    it('should provision a payment when the gateway provider is enabled', async () => {
      mockRepo.findTestById.mockResolvedValue({
        id: 't1',
        name: 'DISC Form A',
        price: 200000,
        status: 'PUBLISHED',
      } as never);
      mockOrderPayment.isEnabled.mockReturnValue(true);
      mockOrderPayment.createPaymentOrder.mockResolvedValue({
        id: 'o1',
        basePrice: 200000,
        uniqueCode: 0,
        amount: 200000,
        expiresAt: new Date(),
        paymentProvider: 'JOKUL_VA',
        vaNumber: '19008172',
        vaBankCode: '014',
        paymentUrl: null,
        paymentToken: null,
      });

      const result = await service.create('t1', 'u1');

      expect(result).toEqual(
        expect.objectContaining({
          paymentProvider: 'JOKUL_VA',
          vaNumber: '19008172',
          vaBankCode: '014',
          qrisImageUrl: null,
          paymentUrl: null,
          paymentToken: null,
        }),
      );
      expect(mockOrderPayment.createPaymentOrder).toHaveBeenCalledWith(
        't1',
        'u1',
        200000,
        'DISC Form A',
      );
      expect(mockRepo.createWithUniqueCheck).not.toHaveBeenCalled();
    });

    it('should throw 404 if test not found', async () => {
      mockRepo.findTestById.mockResolvedValue(null);
      await expect(service.create('t1', 'u1')).rejects.toThrow(
        'Test not found',
      );
    });

    it('should throw 422 if test not PUBLISHED', async () => {
      mockRepo.findTestById.mockResolvedValue({
        id: 't1',
        price: 100,
        status: 'DRAFT',
      } as never);
      await expect(service.create('t1', 'u1')).rejects.toThrow(
        'validation_failed',
      );
    });

    it('should map code_exhausted from repo to 500', async () => {
      mockRepo.findTestById.mockResolvedValue({
        id: 't1',
        price: 200000,
        status: 'PUBLISHED',
      } as never);
      mockRepo.createWithUniqueCheck.mockRejectedValue(
        new Error('code_exhausted'),
      );

      const promise = service.create('t1', 'u1');
      await expect(promise).rejects.toThrow(InternalServerErrorException);
      await expect(promise).rejects.toThrow('code_exhausted');
    });
  });

  describe('findById', () => {
    it('should throw 404 if not found or not owner', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findById('o1', 'u1')).rejects.toThrow(
        'Order not found',
      );
      mockRepo.findById.mockResolvedValue({ id: 'o1', userId: 'u2' } as never);
      await expect(service.findById('o1', 'u1')).rejects.toThrow(
        'Order not found',
      );
    });

    it('should lazy expire PENDING past expiresAt', async () => {
      const past = new Date(Date.now() - 1000);
      mockRepo.findById.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        status: 'PENDING',
        expiresAt: past,
        amount: 200123,
        basePrice: 200000,
        uniqueCode: 123,
        userClaimedAt: null,
      } as never);
      mockRepo.update.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        status: 'EXPIRED',
        expiresAt: past,
        amount: 200123,
        basePrice: 200000,
        uniqueCode: 123,
        userClaimedAt: null,
      } as never);

      const result = await service.findById('o1', 'u1');
      expect(result.status).toBe('EXPIRED');
      expect(result.secondsRemaining).toBeNull();
    });

    it('should expose the Snap payment url and token', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 60_000),
        amount: 200000,
        basePrice: 200000,
        uniqueCode: 0,
        userClaimedAt: null,
        paymentUrl: 'https://app.sandbox.midtrans.com/snap/v4/redirection/tok',
        paymentToken: 'tok',
      } as never);

      const result = await service.findById('o1', 'u1');

      expect(result.paymentUrl).toBe(
        'https://app.sandbox.midtrans.com/snap/v4/redirection/tok',
      );
      expect(result.paymentToken).toBe('tok');
    });

    it('should return secondsRemaining for PENDING', async () => {
      const future = new Date(Date.now() + 60_000);
      mockRepo.findById.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        status: 'PENDING',
        expiresAt: future,
        amount: 200123,
        basePrice: 200000,
        uniqueCode: 123,
        userClaimedAt: null,
      } as never);

      const result = await service.findById('o1', 'u1');
      expect(result.secondsRemaining).toBeGreaterThan(50);
      expect(result.secondsRemaining).toBeLessThanOrEqual(60);
    });
  });

  describe('claim', () => {
    it('should be idempotent', async () => {
      const claimedAt = new Date();
      mockRepo.findById.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        userClaimedAt: claimedAt,
      } as never);

      const result = await service.claim('o1', 'u1');
      expect(result.userClaimedAt).toBe(claimedAt);
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('should set userClaimedAt once', async () => {
      const now = new Date();
      mockRepo.findById
        .mockResolvedValueOnce({
          id: 'o1',
          userId: 'u1',
          userClaimedAt: null,
        } as never)
        .mockResolvedValueOnce({
          id: 'o1',
          userId: 'u1',
          userClaimedAt: now,
        } as never);
      mockRepo.updateClaimIfUnset.mockResolvedValue(1);

      const result = await service.claim('o1', 'u1');
      expect(result.userClaimedAt).toBe(now);
      expect(mockRepo.updateClaimIfUnset).toHaveBeenCalledWith(
        'o1',
        expect.any(Date),
      );
    });
  });

  describe('listPayments', () => {
    const enrichedRow = {
      id: 'o1',
      basePrice: 200000,
      uniqueCode: 21,
      amount: 200021,
      status: 'PENDING',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      expiresAt: new Date('2026-09-01T01:00:00Z'),
      userClaimedAt: null,
      userId: 'u1',
      testId: 't1',
      verifiedById: null,
      verifiedAt: null,
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      user: { name: 'User A', email: 'a@example.com' },
      test: { name: 'DISC Form A' },
      verifiedBy: null,
    };

    beforeEach(() => {
      mockRepo.expireStalePending.mockResolvedValue(0);
    });

    it('should return the admin payment contract shape', async () => {
      mockRepo.findManyEnriched.mockResolvedValue({
        data: [{ ...enrichedRow }] as never,
        total: 1,
      });

      const result = await service.listPayments({ page: 1, limit: 10 });
      expect(result.total).toBe(1);
      expect(result.data[0]).toEqual({
        orderId: 'o1',
        userName: 'User A',
        userEmail: 'a@example.com',
        testName: 'DISC Form A',
        amount: 200021,
        uniqueCode: 21,
        createdAt: '2026-09-01T00:00:00.000Z',
        expiresAt: '2026-09-01T01:00:00.000Z',
        claimed: false,
        status: 'PENDING',
        verifiedBy: null,
      });
    });

    it('should map claimed and verifiedBy when the order was verified', async () => {
      mockRepo.findManyEnriched.mockResolvedValue({
        data: [
          {
            ...enrichedRow,
            status: 'PAID',
            userClaimedAt: new Date('2026-09-01T01:30:00Z'),
            verifiedById: 'admin1',
            verifiedBy: {
              id: 'admin1',
              name: 'Admin One',
              email: 'admin1@example.com',
            },
          } as never,
        ],
        total: 1,
      });

      const result = await service.listPayments({ page: 1, limit: 10 });
      expect(result.data[0].claimed).toBe(true);
      expect(result.data[0].status).toBe('PAID');
      expect(result.data[0].verifiedBy?.email).toBe('admin1@example.com');
    });

    it('should lazily expire stale PENDING and filter by amount/status', async () => {
      mockRepo.findManyEnriched.mockResolvedValue({
        data: [] as never,
        total: 0,
      });

      await service.listPayments({
        page: 2,
        limit: 25,
        amount: 200021,
        status: 'PENDING',
      });
      expect(mockRepo.expireStalePending).toHaveBeenCalled();
      expect(mockRepo.findManyEnriched).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { amount: 200021, status: 'PENDING' },
          skip: 25,
          take: 25,
        }),
      );
    });
  });

  describe('verify', () => {
    it('should throw 404 if not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.verify('o1', 'admin1')).rejects.toThrow(
        'Order not found',
      );
    });

    it('should throw 409 if already PAID', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'o1',
        status: 'PAID',
      } as never);
      await expect(service.verify('o1', 'admin1')).rejects.toThrow(
        'already_verified',
      );
    });

    it('should throw 409 if CANCELLED', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'o1',
        status: 'CANCELLED',
      } as never);
      await expect(service.verify('o1', 'admin1')).rejects.toThrow(
        'order_cancelled',
      );
    });

    it('should verify PENDING and create session+attempt', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
        testId: 't1',
        userId: 'u1',
      } as never);
      mockRepo.verifyPayment.mockResolvedValue({
        outcome: 'verified',
        wasLate: false,
        sessionId: 's1',
        attemptId: 'a1',
      });

      const result = await service.verify('o1', 'admin1');
      expect(result.status).toBe('PAID');
      expect(result.wasLate).toBe(false);
      expect(result.sessionId).toBe('s1');
      expect(result.attemptId).toBe('a1');
      expect(mockRepo.verifyPayment).toHaveBeenCalledWith('o1', 'admin1');
    });

    it('should set wasLate true for EXPIRED', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'o1',
        status: 'EXPIRED',
        testId: 't1',
        userId: 'u1',
      } as never);
      mockRepo.verifyPayment.mockResolvedValue({
        outcome: 'verified',
        wasLate: true,
        sessionId: 's1',
        attemptId: 'a1',
      });

      const result = await service.verify('o1', 'admin1');
      expect(result.wasLate).toBe(true);
    });

    it('should throw 409 when the repo reports a verify race', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
        testId: 't1',
        userId: 'u1',
      } as never);
      mockRepo.verifyPayment.mockResolvedValue({
        outcome: 'conflict',
        reason: 'already_verified',
      });

      await expect(service.verify('o1', 'admin1')).rejects.toThrow(
        'already_verified',
      );
    });

    it('should throw 409 order_cancelled when repo reports cancellation', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
        testId: 't1',
        userId: 'u1',
      } as never);
      mockRepo.verifyPayment.mockResolvedValue({
        outcome: 'conflict',
        reason: 'order_cancelled',
      });

      await expect(service.verify('o1', 'admin1')).rejects.toThrow(
        'order_cancelled',
      );
    });
  });

  describe('cancel', () => {
    it('should cancel PENDING and persist the reason', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
      } as never);
      mockRepo.cancelPayment.mockResolvedValue(1);

      const result = await service.cancel('o1', 'salah cocok mutasi');
      expect(result.status).toBe('CANCELLED');
      expect(mockRepo.cancelPayment).toHaveBeenCalledWith(
        'o1',
        'salah cocok mutasi',
      );
    });

    it('should throw 409 if already PAID', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'o1',
        status: 'PAID',
      } as never);
      await expect(service.cancel('o1', 'reason')).rejects.toThrow(
        'already_verified',
      );
    });

    it('should throw 409 if already CANCELLED', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'o1',
        status: 'CANCELLED',
      } as never);
      await expect(service.cancel('o1', 'reason')).rejects.toThrow(
        'order_cancelled',
      );
    });

    it('should throw 409 if a concurrent verify won the race', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
      } as never);
      mockRepo.cancelPayment.mockResolvedValue(0);
      mockRepo.findById.mockResolvedValueOnce({
        id: 'o1',
        status: 'PENDING',
      } as never);
      mockRepo.findById.mockResolvedValueOnce({
        id: 'o1',
        status: 'PAID',
      } as never);

      await expect(service.cancel('o1', 'reason')).rejects.toThrow(
        'already_verified',
      );
    });
  });
});
