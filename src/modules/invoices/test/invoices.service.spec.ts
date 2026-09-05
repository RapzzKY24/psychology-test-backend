/* eslint-disable @typescript-eslint/unbound-method */
import { InvoicesService } from '../service/invoices.service';
import type { InvoicesRepository } from '../repository/invoices.repository';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let mockRepo: jest.Mocked<InvoicesRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      institutionExists: jest.fn(),
      createNextNumbered: jest.fn(),
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
