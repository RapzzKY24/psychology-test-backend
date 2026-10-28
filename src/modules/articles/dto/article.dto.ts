import { z } from 'zod';
import { ArticleStatus } from '../../../generated/prisma/client';
import type { Article } from '../../../generated/prisma/client';
import { ArticleBlockSchema } from './article-block.dto';
import type { ArticleBlock } from './article-block.dto';

export const AdminArticleSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  coverUrl: z.string().nullable(),
  content: z.array(ArticleBlockSchema),
  category: z.string().nullable(),
  status: z.nativeEnum(ArticleStatus),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AdminArticleDto = z.infer<typeof AdminArticleSchema>;

/** List row — omits the (potentially large) rich-text body. */
export const AdminArticleListItemSchema = AdminArticleSchema.omit({
  content: true,
});

export type AdminArticleListItemDto = z.infer<
  typeof AdminArticleListItemSchema
>;

export const PublicArticleSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  coverUrl: z.string().nullable(),
  content: z.array(ArticleBlockSchema),
  category: z.string().nullable(),
  publishedAt: z.string().nullable(),
});

export type PublicArticleDto = z.infer<typeof PublicArticleSchema>;

/** List/card item — omits the rich-text body. */
export const PublicArticleListItemSchema = PublicArticleSchema.omit({
  content: true,
});

export type PublicArticleListItemDto = z.infer<
  typeof PublicArticleListItemSchema
>;

export function toAdminArticleDto(article: Article): AdminArticleDto {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    coverUrl: article.coverPath
      ? `/api/v1/admin/articles/${article.id}/cover`
      : null,
    content: article.content as ArticleBlock[],
    category: article.category,
    status: article.status,
    publishedAt: article.publishedAt?.toISOString() ?? null,
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
  };
}

export function toAdminArticleListItemDto(
  article: Article,
): AdminArticleListItemDto {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    coverUrl: article.coverPath
      ? `/api/v1/admin/articles/${article.id}/cover`
      : null,
    category: article.category,
    status: article.status,
    publishedAt: article.publishedAt?.toISOString() ?? null,
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
  };
}

export function toPublicArticleDto(article: Article): PublicArticleDto {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    coverUrl: article.coverPath
      ? `/api/v1/articles/${article.slug}/cover`
      : null,
    content: article.content as ArticleBlock[],
    category: article.category,
    publishedAt: article.publishedAt?.toISOString() ?? null,
  };
}

export function toPublicArticleListItemDto(
  article: Article,
): PublicArticleListItemDto {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    coverUrl: article.coverPath
      ? `/api/v1/articles/${article.slug}/cover`
      : null,
    category: article.category,
    publishedAt: article.publishedAt?.toISOString() ?? null,
  };
}
