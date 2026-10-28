import { z } from 'zod';
import type { Invoice, Order } from '../../../generated/prisma/client';

/** What was bought: a prepaid instansi batch (invoice) or a personal test (order). */
export const CheckoutKindSchema = z.enum(['invoice', 'order']);

export type CheckoutKind = z.infer<typeof CheckoutKindSchema>;

/** One vocabulary for both tables so the FE renders a single state machine. */
export const CheckoutStatusSchema = z.enum([
  'PAID',
  'UNPAID',
  'CANCELLED',
  'EXPIRED',
]);

export type CheckoutStatus = z.infer<typeof CheckoutStatusSchema>;

export const CheckoutStatusDtoSchema = z.object({
  kind: CheckoutKindSchema,
  id: z.string(),
  status: CheckoutStatusSchema,
  amount: z.number().int(),
  testNames: z.array(z.string()),
  /** Session opened by the payment; null while unpaid (orders have none). */
  sessionId: z.string().nullable(),
  paidAt: z.string().nullable(),
});

export type CheckoutStatusDto = z.infer<typeof CheckoutStatusDtoSchema>;

export function toInvoiceCheckout(input: {
  invoice: Invoice;
  testNames: string[];
}): CheckoutStatusDto {
  return {
    kind: 'invoice',
    id: input.invoice.id,
    status: input.invoice.status,
    amount: input.invoice.amount,
    testNames: input.testNames,
    sessionId: input.invoice.sessionId,
    paidAt: input.invoice.verifiedAt?.toISOString() ?? null,
  };
}

export function toOrderCheckout(input: {
  order: Order;
  testName: string;
}): CheckoutStatusDto {
  return {
    kind: 'order',
    id: input.order.id,
    // PENDING is the order equivalent of an unpaid invoice.
    status: input.order.status === 'PENDING' ? 'UNPAID' : input.order.status,
    amount: input.order.amount,
    testNames: [input.testName],
    sessionId: null,
    paidAt: input.order.verifiedAt?.toISOString() ?? null,
  };
}
