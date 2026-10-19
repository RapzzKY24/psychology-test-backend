import type { Article } from '../../../generated/prisma/client';
import type { ArticleBlock } from './article-block.dto';

export interface AdminArticleDto {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverUrl: string | null;
  content: ArticleBlock[];
  category: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** List row — omits the (potentially large) rich-text body. */
export interface AdminArticleListItemDto {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverUrl: string | null;
  category: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicArticleDto {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverUrl: string | null;
  content: ArticleBlock[];
  category: string | null;
  publishedAt: string | null;
}

/** List/card item — omits the rich-text body. */
export interface PublicArticleListItemDto {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverUrl: string | null;
  category: string | null;
  publishedAt: string | null;
}

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
