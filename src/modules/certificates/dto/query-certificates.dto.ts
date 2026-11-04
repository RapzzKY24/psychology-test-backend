import { z } from 'zod';
import { PaginationSchema } from '../../../common/dto/pagination.dto';

/** Status is optional: the default list shows drafts and issued rows together. */
export const QueryCertificatesSchema = PaginationSchema.extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'SUPERSEDED', 'REVOKED']).optional(),
}).strict();

export type QueryCertificatesDto = z.infer<typeof QueryCertificatesSchema>;
