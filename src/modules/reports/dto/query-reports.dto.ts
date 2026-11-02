import { z } from 'zod';
import { PaginationSchema } from '../../../common/dto/pagination.dto';

export const QueryReportsSchema = PaginationSchema.extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'SUPERSEDED', 'REVOKED']).optional(),
  sessionId: z.string().uuid().optional(),
}).strict();

export type QueryReportsDto = z.infer<typeof QueryReportsSchema>;
