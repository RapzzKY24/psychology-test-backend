import { z } from 'zod';

/**
 * Contract shape for GET /api/v1/admin/payments (docs/features/07-payments.md line 77-79):
 * { orderId, userName, userEmail, testName, amount, uniqueCode, createdAt, expiresAt, claimed, status, verifiedBy }
 */
export const AdminPaymentListItemSchema = z.object({
  orderId: z.string(),
  userName: z.string(),
  userEmail: z.string(),
  testName: z.string(),
  amount: z.number().int(),
  uniqueCode: z.number().int(),
  createdAt: z.string(),
  expiresAt: z.string(),
  claimed: z.boolean(),
  status: z.enum(['PENDING', 'PAID', 'EXPIRED', 'CANCELLED']),
  verifiedBy: z
    .object({ id: z.string(), name: z.string(), email: z.string() })
    .nullable(),
});

export type AdminPaymentListItemDto = z.infer<
  typeof AdminPaymentListItemSchema
>;
