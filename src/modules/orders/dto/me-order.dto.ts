import { z } from 'zod';
import { PaginationSchema } from '../../../common/dto/pagination.dto';

/** Order states a participant can see on their own purchase history. */
export const MeOrderStatusSchema = z.enum([
  'PENDING',
  'PAID',
  'EXPIRED',
  'CANCELLED',
]);

export const MeOrderItemSchema = z.object({
  id: z.string(),
  testName: z.string(),
  /** Lets an expired row link back to the test page for a new purchase. */
  testSlug: z.string(),
  amount: z.number().int(),
  status: MeOrderStatusSchema,
  createdAt: z.date(),
  expiresAt: z.date(),
  paidAt: z.date().nullable(),
  /**
   * True only while the order can still be paid. The UI uses it to decide
   * between "Bayar" and a finished state; a stale `PENDING` row is not enough.
   */
  canPay: z.boolean(),
  /** Checkout link, present only when `canPay` — never on a settled order. */
  paymentUrl: z.string().nullable(),
});

export type MeOrderItemDto = z.infer<typeof MeOrderItemSchema>;

export const QueryMeOrdersSchema = PaginationSchema.extend({
  status: MeOrderStatusSchema.optional(),
});

export type QueryMeOrdersDto = z.infer<typeof QueryMeOrdersSchema>;
