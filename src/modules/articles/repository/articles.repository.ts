import type { Article, Prisma } from '../../../generated/prisma/client';

export const ARTICLES_REPOSITORY = 'ArticlesRepository';

export interface ArticlesRepository {
  findById(id: string): Promise<Article | null>;
  findBySlug(slug: string): Promise<Article | null>;
  findMany(params: {
    skip: number;
    take: number;
    where?: Prisma.ArticleWhereInput;
    orderBy?: Prisma.ArticleOrderByWithRelationInput;
  }): Promise<{ data: Article[]; total: number }>;
  create(data: Prisma.ArticleCreateInput): Promise<Article>;
  update(id: string, data: Prisma.ArticleUpdateInput): Promise<Article>;
  delete(id: string): Promise<void>;
}
