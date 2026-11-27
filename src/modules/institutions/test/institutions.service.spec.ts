/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method */
import { InstitutionsService } from '../service/institutions.service';
import type { InstitutionsRepository } from '../repository/institutions.repository';

describe('InstitutionsService', () => {
  let service: InstitutionsService;
  let mockRepo: jest.Mocked<InstitutionsRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByOwnerUserId: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      promoteUserAndCreateInstitution: jest.fn(),
      deleteUserById: jest.fn(),
      findTestPricesForTests: jest.fn(),
      listPublishedTestsWithPrices: jest.fn(),
      replaceTestPrices: jest.fn(),
    };
    service = new InstitutionsService(mockRepo);
  });

  describe('create', () => {
    it('should pass dto fields to repo.create', async () => {
      mockRepo.create.mockResolvedValue({ id: 'inst-1' } as any);
      const dto = {
        name: 'PT Maju Jaya',
        contactName: 'Budi HR',
        contactEmail: 'hr@majujaya.co.id',
        phone: '021-555',
        notes: 'Batch rekrutmen 2026',
      };
      await service.create(dto);
      expect(mockRepo.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findMany', () => {
    it('should return PaginatedResponse with full meta', async () => {
      mockRepo.findMany.mockResolvedValue({
        data: [{ id: 'inst-1' } as any],
        total: 21,
      });
      const result = await service.findMany({ page: 2, limit: 10 });
      expect(result.meta).toEqual({
        page: 2,
        limit: 10,
        total: 21,
        totalPages: 3,
      });
      expect(mockRepo.findMany).toHaveBeenCalledWith({
        skip: 10,
        take: 10,
      });
    });
  });

  describe('update', () => {
    it('should throw 404 when institution missing', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(
        'Institution not found',
      );
    });

    it('should pass dto to repo.update when found', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'inst-1' } as any);
      mockRepo.update.mockResolvedValue({ id: 'inst-1', name: 'X' } as any);
      await service.update('inst-1', { name: 'X' });
      expect(mockRepo.update).toHaveBeenCalledWith('inst-1', { name: 'X' });
    });
  });

  describe('test prices', () => {
    const published = [
      {
        testId: 'test-1',
        name: 'WPT',
        slug: 'wpt',
        basePrice: 150000,
        dealPrice: null,
      },
    ];

    it('lists published tests with their deal price', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'inst-1' } as any);
      mockRepo.listPublishedTestsWithPrices.mockResolvedValue(published);

      const result = await service.listTestPrices('inst-1');

      expect(mockRepo.listPublishedTestsWithPrices).toHaveBeenCalledWith(
        'inst-1',
      );
      expect(result).toEqual(published);
    });

    it('404s for an unknown institution', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.listTestPrices('missing')).rejects.toThrow(
        'Institution not found',
      );
    });

    it('rejects a test that is not published', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'inst-1' } as any);
      mockRepo.listPublishedTestsWithPrices.mockResolvedValue(published);

      await expect(
        service.replaceTestPrices('inst-1', {
          prices: [{ testId: 'draft-test', price: 100000 }],
        }),
      ).rejects.toThrow('validation_failed');
      expect(mockRepo.replaceTestPrices).not.toHaveBeenCalled();
    });

    it('replaces the deal prices and returns the refreshed list', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'inst-1' } as any);
      mockRepo.listPublishedTestsWithPrices
        .mockResolvedValueOnce(published)
        .mockResolvedValueOnce([{ ...published[0], dealPrice: 100000 }]);

      const result = await service.replaceTestPrices('inst-1', {
        prices: [{ testId: 'test-1', price: 100000 }],
      });

      expect(mockRepo.replaceTestPrices).toHaveBeenCalledWith('inst-1', [
        { testId: 'test-1', price: 100000 },
      ]);
      expect(result[0].dealPrice).toBe(100000);
    });
  });
});
