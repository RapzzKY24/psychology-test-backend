import { z } from 'zod';
import { PaginationSchema } from '../../../common/dto/pagination.dto';

export const QueryInstansiReportsSchema = PaginationSchema.extend({
  sessionId: z.string().uuid().optional(),
}).strict();

export type QueryInstansiReportsDto = z.infer<
  typeof QueryInstansiReportsSchema
>;
