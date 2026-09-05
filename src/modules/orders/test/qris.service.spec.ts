import { NotFoundException } from '@nestjs/common';
import { QrisService } from '../service/qris.service';
import type { QrisRepository } from '../repository/qris.repository';

describe('QrisService', () => {
  let service: QrisService;
  let mockRepo: jest.Mocked<QrisRepository>;
  let mockConfig: { get: jest.Mock };

  beforeEach(() => {
    mockRepo = {
      findQrisStoredPath: jest.fn(),
      saveQrisStoredPath: jest.fn(),
    };
    mockConfig = { get: jest.fn().mockReturnValue('./uploads') };
    service = new QrisService(mockRepo, mockConfig as never);
  });

  describe('getImagePath', () => {
    it('should throw 404 if not configured', async () => {
      mockRepo.findQrisStoredPath.mockResolvedValue(null);
      await expect(service.getImagePath()).rejects.toThrow(NotFoundException);
      await expect(service.getImagePath()).rejects.toThrow(
        'qris_not_configured',
      );
    });

    it('should throw 404 if file missing', async () => {
      mockRepo.findQrisStoredPath.mockResolvedValue('/tmp/nonexistent.png');
      await expect(service.getImagePath()).rejects.toThrow(
        'qris_not_configured',
      );
    });
  });
});
