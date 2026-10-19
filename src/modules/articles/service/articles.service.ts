import {
  Injectable,
  Inject,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ARTICLES_REPOSITORY } from '../repository/articles.repository';
import type { ArticlesRepository } from '../repository/articles.repository';
import type { CreateArticleDto } from '../dto/create-article.dto';
import type { UpdateArticleDto } from '../dto/update-article.dto';
import type { QueryArticleDto } from '../dto/query-article.dto';
import { toAdminArticleDto, toPublicArticleDto } from '../dto/article.dto';
import type { AdminArticleDto, PublicArticleDto } from '../dto/article.dto';
import type { Prisma } from '../../../generated/prisma/client';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';

@Injectable()
export class ArticlesService {
  constructor(
    @Inject(ARTICLES_REPOSITORY)
    private readonly repo: ArticlesRepository,
    private readonly configService: ConfigService,
  ) {}

  private getUploadDir(): string {
    const dir = this.configService.get<string>('app.uploadDir', './uploads');
    return path.resolve(dir, 'articles');
  }

  private buildWhere(
    query: QueryArticleDto,
    base: Prisma.ArticleWhereInput,
  ): Prisma.ArticleWhereInput {
    const where: Prisma.ArticleWhereInput = { ...base };
    if (query.category) where.category = query.category;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { excerpt: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  async create(dto: CreateArticleDto): Promise<AdminArticleDto> {
    const existing = await this.repo.findBySlug(dto.slug);
    if (existing) throw new ConflictException('slug already exists');
    const article = await this.repo.create({
      slug: dto.slug,
      title: dto.title,
      excerpt: dto.excerpt,
      category: dto.category,
      content: dto.content,
      status: 'DRAFT',
    });
    return toAdminArticleDto(article);
  }

  async findManyAdmin(
    query: QueryArticleDto,
  ): Promise<PaginatedResponse<AdminArticleDto>> {
    const where = this.buildWhere(query, {});
    if (query.status) where.status = query.status;
    const skip = (query.page - 1) * query.limit;
    const { data, total } = await this.repo.findMany({
      skip,
      take: query.limit,
      where,
    });
    return {
      data: data.map(toAdminArticleDto),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findById(id: string): Promise<AdminArticleDto> {
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Article not found');
    return toAdminArticleDto(article);
  }

  async update(id: string, dto: UpdateArticleDto): Promise<AdminArticleDto> {
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Article not found');
    if (dto.slug && dto.slug !== article.slug) {
      const existing = await this.repo.findBySlug(dto.slug);
      if (existing) throw new ConflictException('slug already exists');
    }
    const data: Prisma.ArticleUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.excerpt !== undefined) data.excerpt = dto.excerpt;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.content !== undefined) {
      data.content = dto.content;
    }
    const updated = await this.repo.update(id, data);
    return toAdminArticleDto(updated);
  }

  async publish(id: string): Promise<AdminArticleDto> {
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Article not found');
    const updated = await this.repo.update(id, {
      status: 'PUBLISHED',
      publishedAt: article.publishedAt ?? new Date(),
    });
    return toAdminArticleDto(updated);
  }

  async unpublish(id: string): Promise<AdminArticleDto> {
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Article not found');
    const updated = await this.repo.update(id, {
      status: 'DRAFT',
      publishedAt: null,
    });
    return toAdminArticleDto(updated);
  }

  async remove(id: string): Promise<void> {
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Article not found');
    await this.repo.delete(id);
  }

  async findManyPublic(
    query: QueryArticleDto,
  ): Promise<PaginatedResponse<PublicArticleDto>> {
    const where = this.buildWhere(query, { status: 'PUBLISHED' });
    const skip = (query.page - 1) * query.limit;
    const { data, total } = await this.repo.findMany({
      skip,
      take: query.limit,
      where,
      orderBy: { publishedAt: 'desc' },
    });
    return {
      data: data.map(toPublicArticleDto),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findBySlugPublic(slug: string): Promise<PublicArticleDto> {
    const article = await this.repo.findBySlug(slug);
    if (!article || article.status !== 'PUBLISHED')
      throw new NotFoundException('Article not found');
    return toPublicArticleDto(article);
  }

  /** Persist an uploaded cover and clear the previous file. */
  async saveCover(
    id: string,
    file: Express.Multer.File,
  ): Promise<{ coverUrl: string }> {
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Article not found');
    const dir = this.getUploadDir();
    await fs.promises.mkdir(dir, { recursive: true });
    if (article.coverPath) {
      const oldFull = path.resolve(article.coverPath);
      if (oldFull.startsWith(`${dir}${path.sep}`)) {
        await fs.promises.unlink(oldFull).catch(() => {});
      }
    }
    const ext = file.mimetype === 'image/png' ? '.png' : '.jpg';
    const filename = `${randomUUID()}${ext}`;
    const filePath = path.join(dir, filename);
    await fs.promises.writeFile(filePath, file.buffer);
    await this.repo.update(id, {
      coverPath: path.relative(process.cwd(), filePath),
    });
    return { coverUrl: `/api/v1/admin/articles/${id}/cover` };
  }

  /** Store an inline content image and return its public URL. */
  async saveImage(file: Express.Multer.File): Promise<{ url: string }> {
    const dir = this.getUploadDir();
    await fs.promises.mkdir(dir, { recursive: true });
    const ext = file.mimetype === 'image/png' ? '.png' : '.jpg';
    const filename = `${randomUUID()}${ext}`;
    const filePath = path.join(dir, filename);
    await fs.promises.writeFile(filePath, file.buffer);
    return { url: `/uploads/articles/${filename}` };
  }

  private resolveCoverPath(stored: string | null): string {
    if (!stored) throw new NotFoundException('cover_not_found');
    const base = `${this.getUploadDir()}${path.sep}`;
    const full = path.resolve(stored);
    // Jail to the article upload dir: coverPath comes from the DB and must
    // never resolve outside it (path traversal → arbitrary file read).
    if (!full.startsWith(base) || !fs.existsSync(full))
      throw new NotFoundException('cover_not_found');
    return full;
  }

  async getCoverPathById(id: string): Promise<string> {
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Article not found');
    return this.resolveCoverPath(article.coverPath);
  }

  async getCoverPathBySlug(slug: string): Promise<string> {
    const article = await this.repo.findBySlug(slug);
    if (!article || article.status !== 'PUBLISHED')
      throw new NotFoundException('Article not found');
    return this.resolveCoverPath(article.coverPath);
  }
}
