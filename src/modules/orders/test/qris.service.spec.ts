import { NotFoundException } from '@nestjs/common';
import { QrisService } from '../service/qris.service';
import type { PrismaService } from '../../../prisma/prisma.service';

describe('QrisService', () => {
  let service: QrisService;
  let mockPrisma: jest.Mocked<PrismaService>;
  let mockConfig: { get: jest.Mock };

  beforeEach(() => {
    mockPrisma = {
      setting: { findUnique: jest.fn(), upsert: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;
    mockConfig = { get: jest.fn().mockReturnValue('./uploads') };
    service = new QrisService(mockPrisma, mockConfig as never);
  });

  describe('getImagePath', () => {
    it('should throw 404 if not configured', async () => {
      (mockPrisma.setting.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.getImagePath()).rejects.toThrow(NotFoundException);
      await expect(service.getImagePath()).rejects.toThrow(
        'qris_not_configured',
      );
    });

    it('should throw 404 if file missing', async () => {
      (mockPrisma.setting.findUnique as jest.Mock).mockResolvedValue({
        key: 'payment.qrisImagePath',
        value: { path: '/tmp/nonexistent.png' },
      });
      await expect(service.getImagePath()).rejects.toThrow(
        'qris_not_configured',
      );
    });
  });
});
