/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ArticlesService } from '../service/articles.service';
import type { ArticlesRepository } from '../repository/articles.repository';
import type { Article } from '../../../generated/prisma/client';

function makeArticle(over: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    slug: 'artikel-1',
    title: 'Judul Artikel',
    excerpt: 'Ringkasan artikel yang cukup panjang',
    coverPath: null,
    content: [{ type: 'paragraph', text: 'isi' }],
    category: 'Kesehatan Mental',
    status: 'DRAFT',
    publishedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  };
}

describe('ArticlesService', () => {
  let service: ArticlesService;
  let mockRepo: jest.Mocked<ArticlesRepository>;
  let uploadDir: string;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findBySlug: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'articles-'));
    const config = {
      get: jest.fn().mockReturnValue(uploadDir),
    } as unknown as ConfigService;
    service = new ArticlesService(mockRepo, config);
  });

  afterEach(() => {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('throws 409 when slug already exists', async () => {
      mockRepo.findBySlug.mockResolvedValue(makeArticle());
      await expect(
        service.create({
          title: 'Judul Artikel',
          slug: 'artikel-1',
          excerpt: 'Ringkasan artikel yang cukup panjang',
          content: [{ type: 'paragraph', text: 'isi' }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a DRAFT', async () => {
      mockRepo.findBySlug.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(makeArticle({ status: 'DRAFT' }));
      const result = await service.create({
        title: 'Judul Artikel',
        slug: 'artikel-1',
        excerpt: 'Ringkasan artikel yang cukup panjang',
        content: [{ type: 'paragraph', text: 'isi' }],
      });
      expect(result.status).toBe('DRAFT');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'artikel-1', status: 'DRAFT' }),
      );
    });
  });

  describe('findManyPublic', () => {
    it('only ever queries PUBLISHED articles', async () => {
      mockRepo.findMany.mockResolvedValue({ data: [], total: 0 });
      await service.findManyPublic({ page: 1, limit: 10, status: 'DRAFT' });
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PUBLISHED' }),
        }),
      );
    });

    it('adds an insensitive OR search over title/excerpt', async () => {
      mockRepo.findMany.mockResolvedValue({ data: [], total: 0 });
      await service.findManyPublic({ page: 1, limit: 10, search: 'cemas' });
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: 'cemas', mode: 'insensitive' } },
              { excerpt: { contains: 'cemas', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('list rows omit the rich-text content', async () => {
      mockRepo.findMany.mockResolvedValue({
        data: [makeArticle({ status: 'PUBLISHED' })],
        total: 1,
      });
      const result = await service.findManyPublic({ page: 1, limit: 10 });
      expect(result.data[0]).not.toHaveProperty('content');
      expect(result.data[0]).toHaveProperty('slug', 'artikel-1');
    });
  });

  describe('findBySlugPublic', () => {
    it('throws 404 for a draft', async () => {
      mockRepo.findBySlug.mockResolvedValue(makeArticle({ status: 'DRAFT' }));
      await expect(
        service.findBySlugPublic('artikel-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 for an unknown slug', async () => {
      mockRepo.findBySlug.mockResolvedValue(null);
      await expect(service.findBySlugPublic('asing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns a published article', async () => {
      mockRepo.findBySlug.mockResolvedValue(
        makeArticle({
          status: 'PUBLISHED',
          publishedAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );
      const result = await service.findBySlugPublic('artikel-1');
      expect(result.slug).toBe('artikel-1');
      expect(result.publishedAt).toBe('2026-02-01T00:00:00.000Z');
    });
  });

  describe('publish / unpublish', () => {
    it('publishes and stamps publishedAt on first publish', async () => {
      mockRepo.findById.mockResolvedValue(makeArticle({ publishedAt: null }));
      mockRepo.update.mockResolvedValue(makeArticle({ status: 'PUBLISHED' }));
      await service.publish('a1');
      expect(mockRepo.update).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({ status: 'PUBLISHED' }),
      );
      const call = mockRepo.update.mock.calls[0][1];
      expect(call.publishedAt).toBeInstanceOf(Date);
    });

    it('keeps the original publishedAt on republish', async () => {
      const original = new Date('2026-02-01T00:00:00.000Z');
      mockRepo.findById.mockResolvedValue(
        makeArticle({ status: 'DRAFT', publishedAt: original }),
      );
      mockRepo.update.mockResolvedValue(makeArticle({ status: 'PUBLISHED' }));
      await service.publish('a1');
      expect(mockRepo.update).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({ publishedAt: original }),
      );
    });

    it('unpublishes back to DRAFT and clears publishedAt', async () => {
      mockRepo.findById.mockResolvedValue(
        makeArticle({ status: 'PUBLISHED', publishedAt: new Date() }),
      );
      mockRepo.update.mockResolvedValue(makeArticle({ status: 'DRAFT' }));
      await service.unpublish('a1');
      expect(mockRepo.update).toHaveBeenCalledWith('a1', {
        status: 'DRAFT',
        publishedAt: null,
      });
    });
  });

  describe('update', () => {
    it('throws 404 when the article is missing', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { title: 'Baru' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 409 when the new slug collides', async () => {
      mockRepo.findById.mockResolvedValue(makeArticle({ slug: 'lama' }));
      mockRepo.findBySlug.mockResolvedValue(makeArticle({ slug: 'baru' }));
      await expect(
        service.update('a1', { slug: 'baru' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('images', () => {
    const file = {
      mimetype: 'image/png',
      buffer: Buffer.from('fake'),
    } as Express.Multer.File;

    it('saveImage stores the file and returns a served media URL', async () => {
      const { url } = await service.saveImage(file);
      expect(url).toMatch(/^\/api\/v1\/articles\/media\/[a-f0-9-]+\.png$/);
      const filename = url.split('/').pop() as string;
      expect(fs.existsSync(path.join(uploadDir, 'articles', filename))).toBe(
        true,
      );
    });

    it('getMediaPath resolves a stored file', async () => {
      const { url } = await service.saveImage(file);
      const filename = url.split('/').pop() as string;
      expect(() => service.getMediaPath(filename)).not.toThrow();
    });

    it('getMediaPath rejects path traversal and unknown files', () => {
      expect(() => service.getMediaPath('../../etc/passwd')).toThrow(
        NotFoundException,
      );
      expect(() => service.getMediaPath('missing.png')).toThrow(
        NotFoundException,
      );
    });
  });
});
