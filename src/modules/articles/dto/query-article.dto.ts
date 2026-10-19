import { z } from 'zod';

export const QueryArticleSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  category: z.string().min(1).max(50).optional(),
  search: z.string().min(1).max(200).optional(),
});

export type QueryArticleDto = z.infer<typeof QueryArticleSchema>;
