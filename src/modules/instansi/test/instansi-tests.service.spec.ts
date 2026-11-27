import { InstansiTestsService } from '../service/instansi-tests.service';

const publicTest = {
  id: 'test-1',
  slug: '16pf',
  name: '16PF',
  description: 'Tes kepribadian',
  imageUrl: null,
  category: 'PERSONALITY' as const,
  price: 150000,
  estimatedDurationMin: 60,
  ageBand: null,
};

describe('InstansiTestsService', () => {
  let service: InstansiTestsService;
  let testsService: { findAllPublic: jest.Mock; findBySlugPublic: jest.Mock };
  let institutionsRepo: { findTestPricesForTests: jest.Mock };
  let participantsService: { resolveInstitutionId: jest.Mock };

  beforeEach(() => {
    testsService = { findAllPublic: jest.fn(), findBySlugPublic: jest.fn() };
    institutionsRepo = { findTestPricesForTests: jest.fn() };
    participantsService = {
      resolveInstitutionId: jest.fn().mockResolvedValue('inst-1'),
    };
    service = new InstansiTestsService(
      testsService as never,
      institutionsRepo as never,
      participantsService as never,
    );
  });

  it('applies the institution deal price to the catalog list', async () => {
    testsService.findAllPublic.mockResolvedValue({
      data: [publicTest],
      meta: { page: 1, limit: 1, total: 1, totalPages: 1 },
    });
    institutionsRepo.findTestPricesForTests.mockResolvedValue([
      { testId: 'test-1', price: 100000 },
    ]);

    const result = await service.listForInstitution('user-1');

    expect(participantsService.resolveInstitutionId).toHaveBeenCalledWith(
      'user-1',
    );
    expect(institutionsRepo.findTestPricesForTests).toHaveBeenCalledWith(
      'inst-1',
      ['test-1'],
    );
    expect(result.data[0]).toMatchObject({
      id: 'test-1',
      price: 100000,
      basePrice: 150000,
      hasDealPrice: true,
    });
  });

  it('keeps the website price when no deal exists', async () => {
    testsService.findAllPublic.mockResolvedValue({
      data: [publicTest],
      meta: { page: 1, limit: 1, total: 1, totalPages: 1 },
    });
    institutionsRepo.findTestPricesForTests.mockResolvedValue([]);

    const result = await service.listForInstitution('user-1');

    expect(result.data[0]).toMatchObject({
      price: 150000,
      basePrice: 150000,
      hasDealPrice: false,
    });
  });

  it('returns a single test with the deal price by slug', async () => {
    testsService.findBySlugPublic.mockResolvedValue(publicTest);
    institutionsRepo.findTestPricesForTests.mockResolvedValue([
      { testId: 'test-1', price: 120000 },
    ]);

    const result = await service.findBySlugForInstitution('user-1', '16pf');

    expect(testsService.findBySlugPublic).toHaveBeenCalledWith('16pf');
    expect(result).toMatchObject({
      slug: '16pf',
      price: 120000,
      basePrice: 150000,
      hasDealPrice: true,
    });
  });

  it('falls back to the website price for a single test without a deal', async () => {
    testsService.findBySlugPublic.mockResolvedValue(publicTest);
    institutionsRepo.findTestPricesForTests.mockResolvedValue([]);

    const result = await service.findBySlugForInstitution('user-1', '16pf');

    expect(result).toMatchObject({
      price: 150000,
      basePrice: 150000,
      hasDealPrice: false,
    });
  });

  it('propagates the not-found error for an unknown slug', async () => {
    testsService.findBySlugPublic.mockRejectedValue(
      new Error('Test not found'),
    );

    await expect(
      service.findBySlugForInstitution('user-1', 'missing'),
    ).rejects.toThrow('Test not found');
  });
});
