import { HealthService } from './health.service';

describe('HealthService', () => {
  it('should return true when DB query succeeds', async () => {
    const mockPrisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) } as any;
    const service = new HealthService(mockPrisma);
    await expect(service.isDbUp()).resolves.toBe(true);
  });

  it('should return false when DB query fails', async () => {
    const mockPrisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('db down')) } as any;
    const service = new HealthService(mockPrisma);
    await expect(service.isDbUp()).resolves.toBe(false);
  });

  it('should return false on timeout', async () => {
    const mockPrisma = {
      $queryRaw: jest.fn().mockImplementation(() => new Promise(() => {})), // never resolves
    } as any;
    const service = new HealthService(mockPrisma);
    await expect(service.isDbUp()).resolves.toBe(false);
  }, 10000);
});
