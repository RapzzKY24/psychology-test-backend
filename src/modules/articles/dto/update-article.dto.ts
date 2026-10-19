import { z } from 'zod';
import { ArticleContentSchema } from './article-block.dto';

export const UpdateArticleSchema = z
  .object({
    title: z.string().min(3).max(200).optional(),
    slug: z
      .string()
      .min(3)
      .max(200)
      .regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with dashes')
      .optional(),
    excerpt: z.string().min(10).max(500).optional(),
    category: z.string().min(1).max(50).nullable().optional(),
    content: ArticleContentSchema.optional(),
  })
  .strict()
  .refine((dto) => Object.keys(dto).length > 0, {
    message: 'at least one field must be provided',
  });

export type UpdateArticleDto = z.infer<typeof UpdateArticleSchema>;
