import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Test, Prisma } from '../../../generated/prisma/client';
import type { TestsRepository } from './tests.repository';

@Injectable()
export class PrismaTestsRepository implements TestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Test | null> {
    return this.prisma.test.findUnique({ where: { id } });
  }

  findBySlug(slug: string): Promise<Test | null> {
    return this.prisma.test.findUnique({ where: { slug } });
  }

  async findMany(params: {
    skip: number;
    take: number;
    where?: Prisma.TestWhereInput;
    orderBy?: Prisma.TestOrderByWithRelationInput;
  }): Promise<{ data: Test[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.test.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy ?? { createdAt: 'desc' },
      }),
      this.prisma.test.count({ where: params.where }),
    ]);
    return { data, total };
  }

  create(data: Prisma.TestCreateInput): Promise<Test> {
    return this.prisma.test.create({ data });
  }

  update(id: string, data: Prisma.TestUpdateInput): Promise<Test> {
    return this.prisma.test.update({ where: { id }, data });
  }

  async deleteManyByTestId(testId: string): Promise<void> {
    await this.prisma.testItem.deleteMany({ where: { testId } });
  }
}
