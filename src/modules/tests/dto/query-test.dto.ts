import { z } from 'zod';

export const QueryTestSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  category: z.enum(['PERSONALITY', 'COGNITIVE', 'WORK_STYLE', 'INTEREST', 'PROJECTIVE']).optional(),
});

export type QueryTestDto = z.infer<typeof QueryTestSchema>;
