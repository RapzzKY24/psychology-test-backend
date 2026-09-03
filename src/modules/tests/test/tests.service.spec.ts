/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method */
import { TestsService } from '../service/tests.service';
import type { TestsRepository } from '../repository/tests.repository';

describe('TestsService', () => {
  let service: TestsService;
  let mockRepo: jest.Mocked<TestsRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
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
