/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method */
import { TestsService } from '../service/tests.service';
import type { TestsRepository } from '../repository/tests.repository';

describe('TestsService', () => {
  let service: TestsService;
  let mockRepo: jest.Mocked<TestsRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findDetailById: jest.fn(),
      findBySlug: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      hasInProgressAttempts: jest.fn(),
      replaceItems: jest.fn(),
      replaceInterpretations: jest.fn(),
      findItemsByTestId: jest.fn(),
      findInterpretationsByTestId: jest.fn(),
    };
    service = new TestsService(mockRepo);
  });

  describe('create', () => {
    it('should throw Conflict if slug exists', async () => {
      mockRepo.findBySlug.mockResolvedValue({ id: '1', slug: 'disc' } as any);
      await expect(
        service.create({
          name: 'Test',
          slug: 'disc',
          description: 'Desc 12345',
          category: 'PERSONALITY',
          scorerType: 'FORCED_CHOICE_DISC',
          price: 100,
          estimatedDurationMin: 10,
        } as any),
      ).rejects.toThrow('slug already exists');
    });

    it('should create with DRAFT status', async () => {
      mockRepo.findBySlug.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue({
        id: '1',
        slug: 'disc',
        status: 'DRAFT',
      } as any);
      const result = await service.create({
        name: 'Test',
        slug: 'disc',
        description: 'Desc 12345',
        category: 'PERSONALITY',
        scorerType: 'FORCED_CHOICE_DISC',
        price: 100,
        estimatedDurationMin: 10,
      } as any);
      expect(result.status).toBe('DRAFT');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'disc', status: 'DRAFT' }),
      );
    });
  });

  describe('findMany', () => {
    it('should build where from status/category and pagination meta', async () => {
      mockRepo.findMany.mockResolvedValue({
        data: [{ id: '1' } as any],
        total: 25,
      });
      const result = await service.findMany({
        page: 1,
        limit: 10,
        status: 'DRAFT',
        category: 'PERSONALITY',
      } as any);
      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        total: 25,
        totalPages: 3,
      });
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'DRAFT', category: 'PERSONALITY' },
          skip: 0,
          take: 10,
        }),
      );
    });
  });

  describe('update', () => {
    it('should throw 404 if not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.update('id', {} as any)).rejects.toThrow(
        'Test not found',
      );
    });

    it('should throw 409 if slug immutable when PUBLISHED', async () => {
      mockRepo.findById.mockResolvedValue({
        id: '1',
        slug: 'old',
        status: 'PUBLISHED',
      } as any);
      await expect(service.update('1', { slug: 'new' } as any)).rejects.toThrow(
        'slug is immutable when PUBLISHED',
      );
    });

    it('should throw 409 on slug collision', async () => {
      mockRepo.findById.mockResolvedValue({
        id: '1',
        slug: 'old',
        status: 'DRAFT',
      } as any);
      mockRepo.findBySlug.mockResolvedValue({ id: '2', slug: 'new' } as any);
      await expect(service.update('1', { slug: 'new' } as any)).rejects.toThrow(
        'slug already exists',
      );
    });
  });

  describe('findManyPublic', () => {
    it('should only expose PUBLISHED tests with pagination meta', async () => {
      mockRepo.findMany.mockResolvedValue({
        data: [{ id: '1', slug: 'disc' } as any],
        total: 0,
      });
      const result = await service.findManyPublic({
        page: 1,
        limit: 10,
      });
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'PUBLISHED' } }),
      );
      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });
    });

    it('should filter by category when provided', async () => {
      mockRepo.findMany.mockResolvedValue({ data: [], total: 0 });
      await service.findManyPublic({
        page: 1,
        limit: 10,
        category: 'PERSONALITY',
      } as any);
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PUBLISHED', category: 'PERSONALITY' },
        }),
      );
    });
  });

  describe('findBySlugPublic', () => {
    it('should return the public-safe shape for a PUBLISHED test', async () => {
      mockRepo.findBySlug.mockResolvedValue({
        id: '1',
        slug: 'disc',
        name: 'DISC Form A',
        description: 'Desc',
        category: 'PERSONALITY',
        price: 100,
        estimatedDurationMin: 10,
        status: 'PUBLISHED',
        internalField: 'secret',
      } as any);
      const result = await service.findBySlugPublic('disc');
      expect(result).toEqual({
        id: '1',
        slug: 'disc',
        name: 'DISC Form A',
        description: 'Desc',
        category: 'PERSONALITY',
        price: 100,
        estimatedDurationMin: 10,
      });
    });

    it('should throw 404 when slug is unknown or not PUBLISHED', async () => {
      mockRepo.findBySlug.mockResolvedValue(null);
      await expect(service.findBySlugPublic('nope')).rejects.toThrow(
        'Test not found',
      );
      mockRepo.findBySlug.mockResolvedValue({ status: 'DRAFT' } as any);
      await expect(service.findBySlugPublic('draft')).rejects.toThrow(
        'Test not found',
      );
    });
  });

  describe('putItems', () => {
    it('should throw 404 if test not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.putItems('id', [])).rejects.toThrow(
        'Test not found',
      );
    });

    it('should throw 409 if ARCHIVED', async () => {
      mockRepo.findById.mockResolvedValue({
        id: '1',
        status: 'ARCHIVED',
        scorerType: 'FORCED_CHOICE_DISC',
      } as any);
      await expect(service.putItems('1', [])).rejects.toThrow(
        'cannot edit ARCHIVED test',
      );
    });

    it('should throw 409 edit_locked if IN_PROGRESS', async () => {
      mockRepo.findById.mockResolvedValue({
        id: '1',
        status: 'DRAFT',
        scorerType: 'FORCED_CHOICE_DISC',
      } as any);
      mockRepo.hasInProgressAttempts.mockResolvedValue(true);
      await expect(service.putItems('1', [])).rejects.toThrow('edit_locked');
    });

    it('should throw 422 for invalid item content', async () => {
      mockRepo.findById.mockResolvedValue({
        id: '1',
        status: 'DRAFT',
        scorerType: 'FORCED_CHOICE_DISC',
      } as any);
      mockRepo.hasInProgressAttempts.mockResolvedValue(false);
      await expect(
        service.putItems('1', [
          {
            content: {
              words: ['Only', 'Three', 'Words'],
              mostMapping: ['D', 'I', 'S', 'C'],
              leastMapping: ['D', 'I', 'S', 'C'],
            },
          } as any,
        ]),
      ).rejects.toThrow('validation_failed');
    });

    it('should replace items transactionally and return count', async () => {
      mockRepo.findById.mockResolvedValue({
        id: '1',
        status: 'DRAFT',
        scorerType: 'FORCED_CHOICE_DISC',
      } as any);
      mockRepo.hasInProgressAttempts.mockResolvedValue(false);
      mockRepo.replaceItems.mockResolvedValue(undefined);
      const result = await service.putItems('1', [
        {
          content: {
            words: ['A', 'B', 'C', 'D'],
            mostMapping: ['D', 'I', 'S', 'C'],
            leastMapping: ['D', 'I', 'S', 'C'],
          },
        },
      ]);
      expect(result).toEqual({ count: 1 });
      expect(mockRepo.replaceItems).toHaveBeenCalledWith(
        '1',
        expect.any(Array),
      );
    });
  });
});

describe('TestsService.findDetailById', () => {
  let service: TestsService;
  let mockRepo: jest.Mocked<TestsRepository>;

  beforeEach(() => {
    mockRepo = {
      findDetailById: jest.fn(),
    } as unknown as jest.Mocked<TestsRepository>;
    service = new TestsService(mockRepo);
  });

  it('returns the test with ordered items and interpretations', async () => {
    mockRepo.findDetailById.mockResolvedValue({
      test: { id: 't1', name: 'DISC Form A', slug: 'disc-form-a' } as any,
      items: [
        { id: 'i1', order: 1, content: { words: ['a', 'b', 'c', 'd'] } },
        { id: 'i2', order: 2, content: { words: ['e', 'f', 'g', 'h'] } },
      ],
      interpretations: [{ patternCode: '1', title: 'T', body: 'B' }],
    });

    const detail = await service.findDetailById('t1');

    expect(detail.id).toBe('t1');
    expect(detail.items).toHaveLength(2);
    expect(detail.items[0]?.order).toBe(1);
    expect(detail.interpretations).toHaveLength(1);
  });

  it('throws NotFound when the test does not exist', async () => {
    mockRepo.findDetailById.mockResolvedValue(null);
    await expect(service.findDetailById('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
