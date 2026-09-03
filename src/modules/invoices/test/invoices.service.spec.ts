/* eslint-disable @typescript-eslint/unbound-method */
import { InvoicesService } from '../service/invoices.service';
import type { InvoicesRepository } from '../repository/invoices.repository';
import type { PrismaService } from '../../../prisma/prisma.service';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let mockRepo: jest.Mocked<InvoicesRepository>;
  let mockPrisma: jest.Mocked<PrismaService>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findLastNumberForYear: jest.fn(),
    };
    mockPrisma = {
      institution: { findUnique: jest.fn() },
      invoice: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    } as unknown as jest.Mocked<PrismaService>;
    service = new InvoicesService(mockRepo, mockPrisma);
  });

  describe('create', () => {
    it('should throw 404 if institution not found', async () => {
      (mockPrisma.institution.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.create({ institutionId: 'inst1', amount: 1000 }),
      ).rejects.toThrow('Institution not found');
    });

    it('should generate INV-YYYY-NNNN sequentially', async () => {
      (mockPrisma.institution.findUnique as jest.Mock).mockResolvedValue({
        id: 'inst1',
      });
      (mockPrisma.$transaction as jest.Mock).mockImplementation(
        async (cb: never) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([]),
            invoice: {
              findFirst: jest
                .fn()
                .mockResolvedValue({ number: 'INV-2026-0005' }),
              create: jest.fn().mockResolvedValue({
                id: 'inv1',
                number: 'INV-2026-0006',
                amount: 1000,
              }),
            },
          };
          return (cb as unknown as (tx: never) => Promise<unknown>)(
            tx as never,
          );
        },
      );

      const result = await service.create({
        institutionId: 'inst1',
        amount: 1000,
      });
      expect(result.number).toBe('INV-2026-0006');
    });

    it('should start at 0001 if no prior invoice', async () => {
      (mockPrisma.institution.findUnique as jest.Mock).mockResolvedValue({
        id: 'inst1',
      });
      (mockPrisma.$transaction as jest.Mock).mockImplementation(
        async (cb: never) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([]),
            invoice: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({
                id: 'inv1',
                number: 'INV-2026-0001',
                amount: 1000,
              }),
            },
          };
          return (cb as unknown as (tx: never) => Promise<unknown>)(
            tx as never,
          );
        },
      );

      const result = await service.create({
        institutionId: 'inst1',
        amount: 1000,
      });
      expect(result.number).toBe('INV-2026-0001');
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
