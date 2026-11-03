import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TESTS_REPOSITORY } from '../repository/tests.repository';
import type { TestsRepository } from '../repository/tests.repository';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import type { Express } from 'express';
import { ensureUploadDir } from '../../../lib/fs/ensure-upload-dir';
import { generateTestImageFilename } from '../utils/generate-test-image-filename';
import type { CreateTestDto } from '../dto/create-test.dto';
import type { UpdateTestDto } from '../dto/update-test.dto';
import type { Test, Prisma } from '../../../generated/prisma/client';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';
import type { QueryTestDto } from '../dto/query-test.dto';
import type { PublicTestDto } from '../dto/public-test.dto';
import { getItemSchema } from '../../../scorers/schemas';

/** Admin builder detail: full test plus its ordered items and interpretations. */
export type TestDetail = Test & {
  items: { id: string; order: number; content: unknown }[];
  interpretations: { patternCode: string; title: string; body: string }[];
};

@Injectable()
export class TestsService {
  constructor(
    @Inject(TESTS_REPOSITORY)
    private readonly repo: TestsRepository,
    private readonly configService: ConfigService,
  ) {}

  async create(dto: CreateTestDto): Promise<Test> {
    const existing = await this.repo.findBySlug(dto.slug);
    if (existing) throw new ConflictException('slug already exists');
    return this.repo.create({
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
      category: dto.category,
      scorerType: dto.scorerType,
      price: dto.price,
      estimatedDurationMin: dto.estimatedDurationMin,
      status: 'DRAFT',
    });
  }

  async findMany(query: QueryTestDto): Promise<PaginatedResponse<Test>> {
    const where: Prisma.TestWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;
    const skip = (query.page - 1) * query.limit;
    const { data, total } = await this.repo.findMany({
      skip,
      take: query.limit,
      where,
    });
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findById(id: string): Promise<Test> {
    const test = await this.repo.findById(id);
    if (!test) throw new NotFoundException('Test not found');
    return test;
  }

  /** Builder payload: test + ordered items + interpretations (admin detail). */
  async findDetailById(id: string): Promise<TestDetail> {
    const detail = await this.repo.findDetailById(id);
    if (!detail) throw new NotFoundException('Test not found');
    return {
      ...detail.test,
      items: detail.items,
      interpretations: detail.interpretations,
    };
  }

  async findManyPublic(
    query: QueryTestDto,
  ): Promise<PaginatedResponse<PublicTestDto>> {
    const where: Prisma.TestWhereInput = { status: 'PUBLISHED' };
    if (query.category) where.category = query.category;
    const skip = (query.page - 1) * query.limit;
    const { data, total } = await this.repo.findMany({
      skip,
      take: query.limit,
      where,
    });
    const publicData = data.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      description: t.description,
      imageUrl: t.imageUrl,
      category: t.category,
      price: t.price,
      estimatedDurationMin: t.estimatedDurationMin,
    }));
    return {
      data: publicData,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findManyPublicFiltered(filter: {
    slug: string;
  }): Promise<PaginatedResponse<PublicTestDto>> {
    const where: Prisma.TestWhereInput = {
      status: 'PUBLISHED',
      slug: filter.slug,
    };
    const { data, total } = await this.repo.findMany({
      skip: 0,
      take: 100,
      where,
    });
    const publicData = data.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      description: t.description,
      imageUrl: t.imageUrl,
      category: t.category,
      price: t.price,
      estimatedDurationMin: t.estimatedDurationMin,
    }));
    return {
      data: publicData,
      meta: { page: 1, limit: 100, total, totalPages: 1 },
    };
  }

  async findBySlugPublic(slug: string): Promise<PublicTestDto> {
    const test = await this.repo.findBySlug(slug);
    if (!test || test.status !== 'PUBLISHED')
      throw new NotFoundException('Test not found');
    return {
      id: test.id,
      slug: test.slug,
      name: test.name,
      description: test.description,
      imageUrl: test.imageUrl,
      category: test.category,
      price: test.price,
      estimatedDurationMin: test.estimatedDurationMin,
    };
  }

  /**
   * Catalog cover: written to `UPLOAD_DIR/test-covers`, saved on the test, then
   * the replaced file is deleted so uploads do not accumulate.
   */
  async saveCoverImage(id: string, file: Express.Multer.File): Promise<Test> {
    const test = await this.findById(id);
    const coverDir = await this.imageDir('test-covers');
    const filename = generateTestImageFilename(
      file.originalname,
      file.mimetype,
    );
    await fs.promises.writeFile(path.join(coverDir, filename), file.buffer);

    const updated = await this.repo.update(id, {
      imageUrl: `/uploads/test-covers/${filename}`,
    });
    await this.removeStoredFile(
      test.imageUrl,
      coverDir,
      '/uploads/test-covers/',
    );
    return updated;
  }

  /** Item figure (question image); the path is stored in the item JSON. */
  async saveItemImage(
    id: string,
    file: Express.Multer.File,
  ): Promise<{ imageUrl: string }> {
    await this.findById(id);
    const itemDir = await this.imageDir('test-items');
    const filename = generateTestImageFilename(
      file.originalname,
      file.mimetype,
    );
    await fs.promises.writeFile(path.join(itemDir, filename), file.buffer);
    return { imageUrl: `/uploads/test-items/${filename}` };
  }

  async update(id: string, dto: UpdateTestDto): Promise<Test> {
    const test = await this.repo.findById(id);
    if (!test) throw new NotFoundException('Test not found');
    if (dto.slug && dto.slug !== test.slug && test.status === 'PUBLISHED') {
      throw new ConflictException('slug is immutable when PUBLISHED');
    }
    if (dto.slug && dto.slug !== test.slug) {
      const existing = await this.repo.findBySlug(dto.slug);
      if (existing) throw new ConflictException('slug already exists');
    }
    if (dto.scorerType && dto.scorerType !== test.scorerType) {
      await this.assertScorerSwitchable(id, test);
    }
    return this.repo.update(id, dto);
  }

  /**
   * The item editor is chosen by scorerType, so switching it after items exist
   * would leave rows the new schema cannot read. Only an empty draft may change.
   */
  private async assertScorerSwitchable(
    id: string,
    test: { status: string },
  ): Promise<void> {
    if (test.status !== 'DRAFT') {
      throw new ConflictException('scorer_type_locked');
    }
    const items = await this.repo.findItemsByTestId(id);
    if (items.length > 0) {
      throw new ConflictException('scorer_type_locked');
    }
  }

  /** Resolve (and create) a public image dir under the configured upload root. */
  private async imageDir(sub: 'test-items' | 'test-covers'): Promise<string> {
    const root = this.configService.get<string>('app.uploadDir', './uploads');
    const dir = path.join(root, sub);
    await ensureUploadDir(dir);
    return dir;
  }

  /** Best-effort cleanup of a replaced file (never fails the upload). */
  private async removeStoredFile(
    stored: string | null,
    dir: string,
    urlPrefix: string,
  ): Promise<void> {
    if (!stored?.startsWith(urlPrefix)) return;
    const full = path.join(dir, path.basename(stored));
    await fs.promises.unlink(full).catch(() => undefined);
  }

  async putItems(
    testId: string,
    items: { content: unknown }[],
  ): Promise<{ count: number }> {
    const test = await this.repo.findById(testId);
    if (!test) throw new NotFoundException('Test not found');
    if (test.status === 'ARCHIVED')
      throw new ConflictException('cannot edit ARCHIVED test');

    if (await this.repo.hasInProgressAttempts(testId))
      throw new ConflictException('edit_locked');

    const schema = getItemSchema(test.scorerType);
    if (schema) {
      for (let i = 0; i < items.length; i++) {
        const result = schema.safeParse(items[i].content);
        if (!result.success) {
          throw new UnprocessableEntityException({
            message: 'validation_failed',
            details: [
              `items[${i}]: ${result.error.issues.map((iss) => `${iss.path.join('.')}: ${iss.message}`).join(', ')}`,
            ],
          });
        }
      }
    }

    await this.repo.replaceItems(testId, items);

    return { count: items.length };
  }

  async putInterpretations(
    testId: string,
    interpretations: { patternCode: string; title: string; body: string }[],
  ): Promise<{ count: number }> {
    const test = await this.repo.findById(testId);
    if (!test) throw new NotFoundException('Test not found');
    if (test.status === 'ARCHIVED')
      throw new ConflictException('cannot edit ARCHIVED test');

    if (await this.repo.hasInProgressAttempts(testId))
      throw new ConflictException('edit_locked');

    await this.repo.replaceInterpretations(testId, interpretations);

    return { count: interpretations.length };
  }
}
