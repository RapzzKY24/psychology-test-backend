import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Article, Prisma } from '../../../generated/prisma/client';
import type { ArticlesRepository } from './articles.repository';

@Injectable()
export class PrismaArticlesRepository implements ArticlesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Article | null> {
    return this.prisma.article.findUnique({ where: { id } });
  }

  findBySlug(slug: string): Promise<Article | null> {
    return this.prisma.article.findUnique({ where: { slug } });
  }

  async findMany(params: {
    skip: number;
    take: number;
    where?: Prisma.ArticleWhereInput;
    orderBy?: Prisma.ArticleOrderByWithRelationInput;
  }): Promise<{ data: Article[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.article.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy ?? { createdAt: 'desc' },
      }),
      this.prisma.article.count({ where: params.where }),
    ]);
    return { data, total };
  }

  create(data: Prisma.ArticleCreateInput): Promise<Article> {
    return this.prisma.article.create({ data });
  }

  update(id: string, data: Prisma.ArticleUpdateInput): Promise<Article> {
    return this.prisma.article.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.article.delete({ where: { id } });
  }
}
