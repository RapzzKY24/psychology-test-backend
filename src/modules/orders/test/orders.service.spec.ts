/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
import { OrdersService } from '../service/orders.service';
import type { OrdersRepository } from '../repository/orders.repository';
import type { PrismaService } from '../../../prisma/prisma.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let mockRepo: jest.Mocked<OrdersRepository>;
  let mockPrisma: jest.Mocked<PrismaService>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findPendingOrPaidByAmount: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateManyToExpired: jest.fn(),
      findMany: jest.fn(),
    };
    mockPrisma = {
      test: { findUnique: jest.fn() },
      setting: { findUnique: jest.fn() },
      order: { updateMany: jest.fn(), findUnique: jest.fn() },
      institution: { findUnique: jest.fn() },
      testSession: { create: jest.fn() },
      attempt: { create: jest.fn() },
      $transaction: jest.fn(),
    } as unknown as jest.Mocked<PrismaService>;
    service = new OrdersService(mockRepo, mockPrisma);
  });

  describe('create', () => {
    it('should create order with unique code and total', async () => {
      (mockPrisma.test.findUnique as jest.Mock).mockResolvedValue({
        id: 't1',
        price: 200000,
        status: 'PUBLISHED',
      });
      mockRepo.findPendingOrPaidByAmount.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue({
        id: 'o1',
        basePrice: 200000,
        uniqueCode: 123,
        amount: 200123,
        expiresAt: new Date(),
      } as never);
      (mockPrisma.setting.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.create('t1', 'u1');
      expect(result.basePrice).toBe(200000);
      expect(result.uniqueCode).toBeGreaterThanOrEqual(1);
      expect(result.uniqueCode).toBeLessThanOrEqual(999);
      expect(result.amount).toBe(result.basePrice + result.uniqueCode);
    });

    it('should throw 404 if test not found', async () => {
      (mockPrisma.test.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.create('t1', 'u1')).rejects.toThrow(
        'Test not found',
      );
    });

    it('should throw 422 if test not PUBLISHED', async () => {
      (mockPrisma.test.findUnique as jest.Mock).mockResolvedValue({
        id: 't1',
        price: 100,
        status: 'DRAFT',
      });
      await expect(service.create('t1', 'u1')).rejects.toThrow(
        'validation_failed',
      );
    });

    it('should retry on amount collision', async () => {
      (mockPrisma.test.findUnique as jest.Mock).mockResolvedValue({
        id: 't1',
        price: 200000,
        status: 'PUBLISHED',
      });
      mockRepo.findPendingOrPaidByAmount
        .mockResolvedValueOnce({ id: 'existing' } as never)
        .mockResolvedValueOnce(null);
      mockRepo.create.mockResolvedValue({
        id: 'o1',
        basePrice: 200000,
        uniqueCode: 124,
        amount: 200124,
        expiresAt: new Date(),
      } as never);
      (mockPrisma.setting.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.create('t1', 'u1');
      expect(mockRepo.findPendingOrPaidByAmount).toHaveBeenCalledTimes(2);
      expect(result.uniqueCode).toBeDefined();
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
      mockRepo.findById.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        userClaimedAt: null,
      } as never);
      const now = new Date();
      mockRepo.update.mockResolvedValue({
        id: 'o1',
        userClaimedAt: now,
      } as never);

      const result = await service.claim('o1', 'u1');
      expect(result.userClaimedAt).toBe(now);
      expect(mockRepo.update).toHaveBeenCalledWith(
        'o1',
        expect.objectContaining({ userClaimedAt: expect.any(Date) }),
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
      const tx = {
        order: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn(),
        },
        testSession: { create: jest.fn().mockResolvedValue({ id: 's1' }) },
        attempt: { create: jest.fn().mockResolvedValue({ id: 'a1' }) },
      };
      (mockPrisma.$transaction as jest.Mock).mockImplementation(
        async (cb: never) =>
          (cb as unknown as (tx: never) => Promise<unknown>)(tx as never),
      );

      const result = await service.verify('o1', 'admin1');
      expect(result.status).toBe('PAID');
      expect(result.wasLate).toBe(false);
      expect(result.sessionId).toBe('s1');
      expect(result.attemptId).toBe('a1');
    });

    it('should set wasLate true for EXPIRED', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'o1',
        status: 'EXPIRED',
        testId: 't1',
        userId: 'u1',
      } as never);
      const tx = {
        order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        testSession: { create: jest.fn().mockResolvedValue({ id: 's1' }) },
        attempt: { create: jest.fn().mockResolvedValue({ id: 'a1' }) },
      };
      (mockPrisma.$transaction as jest.Mock).mockImplementation(
        async (cb: never) =>
          (cb as unknown as (tx: never) => Promise<unknown>)(tx as never),
      );

      const result = await service.verify('o1', 'admin1');
      expect(result.wasLate).toBe(true);
    });

    it('should throw 409 on concurrent verify (count 0)', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
        testId: 't1',
        userId: 'u1',
      } as never);
      const tx = {
        order: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          findUnique: jest.fn().mockResolvedValue({ id: 'o1', status: 'PAID' }),
        },
        testSession: { create: jest.fn() },
        attempt: { create: jest.fn() },
      };
      (mockPrisma.$transaction as jest.Mock).mockImplementation(
        async (cb: never) =>
          (cb as unknown as (tx: never) => Promise<unknown>)(tx as never),
      );

      await expect(service.verify('o1', 'admin1')).rejects.toThrow(
        'already_verified',
      );
    });
  });

  describe('cancel', () => {
    it('should cancel PENDING', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
      } as never);
      (mockPrisma.order.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });

      const result = await service.cancel('o1', 'reason');
      expect(result.status).toBe('CANCELLED');
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
  });
});
