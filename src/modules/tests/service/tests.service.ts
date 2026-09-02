import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TESTS_REPOSITORY } from '../repository/tests.repository';
import type { TestsRepository } from '../repository/tests.repository';
import { Inject } from '@nestjs/common';
import type { CreateTestDto } from '../dto/create-test.dto';
import type { UpdateTestDto } from '../dto/update-test.dto';
import type { Test, Prisma } from '../../../generated/prisma/client';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';
import type { QueryTestDto } from '../dto/query-test.dto';
import { getItemSchema } from '../../../scorers/schemas';

@Injectable()
export class TestsService {
  constructor(
    @Inject(TESTS_REPOSITORY)
    private readonly repo: TestsRepository,
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
    return this.repo.update(id, dto);
  }

  async putItems(testId: string, items: { content: unknown }[]): Promise<{ count: number }> {
    const test = await this.repo.findById(testId);
    if (!test) throw new NotFoundException('Test not found');
    if (test.status === 'ARCHIVED') throw new ConflictException('cannot edit ARCHIVED test');

    if (await this.repo.hasInProgressAttempts(testId)) throw new ConflictException('edit_locked');

    const schema = getItemSchema(test.scorerType);
    if (schema) {
      for (let i = 0; i < items.length; i++) {
        const result = schema.safeParse(items[i].content);
        if (!result.success) {
          throw new UnprocessableEntityException({
            message: 'validation_failed',
            details: [`items[${i}]: ${result.error.issues.map((iss) => `${iss.path.join('.')}: ${iss.message}`).join(', ')}`],
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
    if (test.status === 'ARCHIVED') throw new ConflictException('cannot edit ARCHIVED test');

    if (await this.repo.hasInProgressAttempts(testId)) throw new ConflictException('edit_locked');

    await this.repo.replaceInterpretations(testId, interpretations);

    return { count: interpretations.length };
  }
}
