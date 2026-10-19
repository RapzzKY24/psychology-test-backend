import { z } from 'zod';
import { ArticleContentSchema } from './article-block.dto';

export const CreateArticleSchema = z
  .object({
    title: z.string().min(3).max(200),
    slug: z
      .string()
      .min(3)
      .max(200)
      .regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with dashes'),
    excerpt: z.string().min(10).max(500),
    category: z.string().min(1).max(50).optional(),
    content: ArticleContentSchema,
  })
  .strict();

export type CreateArticleDto = z.infer<typeof CreateArticleSchema>;
