import { z } from 'zod';

/** Doku sends amounts as strings and sometimes with decimals ("20000.00"). */
const AmountSchema = z.union([z.string(), z.number()]);

/** `POST /checkout/v1/payment`. Only the hosted URL is actually consumed. */
export const DokuCreatePaymentResponseSchema = z
  .object({
    response: z.object({
      order: z.object({ invoice_number: z.string().optional() }).optional(),
      payment: z.object({ url: z.string().min(1) }),
    }),
  })
  .passthrough();

export type DokuCreatePaymentResponse = z.infer<
  typeof DokuCreatePaymentResponseSchema
>;

/**
 * `GET /orders/v1/status/{invoice_number}`.
 *
 * `order.amount` is optional here because it is optional in the docs: when it
 * is absent the reconciliation pass cannot prove the amount, and a settlement
 * without proof is not a settlement (see PaymentsService.reconcileOrder).
 */
export const DokuStatusResponseSchema = z
  .object({
    order: z
      .object({
        invoice_number: z.string().optional(),
        amount: AmountSchema.optional(),
      })
      .optional(),
    transaction: z.object({ status: z.string().min(1) }),
  })
  .passthrough();

export type DokuStatusResponse = z.infer<typeof DokuStatusResponseSchema>;

/** Inbound callback body. Unknown keys are kept for the audit trail. */
export const DokuNotificationSchema = z
  .object({
    order: z.object({
      invoice_number: z.string().min(1),
      amount: AmountSchema.optional(),
    }),
    transaction: z.object({
      status: z.string().min(1),
      original_request_id: z.string().optional(),
      date: z.string().optional(),
    }),
    channel: z.object({ id: z.string().optional() }).optional(),
  })
  .passthrough();

export type DokuNotification = z.infer<typeof DokuNotificationSchema>;

/**
 * The redacted payload `event_log` keeps for a callback. It is flat, not the
 * nested callback body, so the recovery pass needs its own schema rather than
 * re-parsing the original shape.
 */
export const DokuStoredNotificationSchema = z.object({
  invoice_number: z.string().min(1),
  amount: AmountSchema.nullish(),
  status: z.string().min(1),
  channel: z.string().nullish(),
  reference_no: z.string().nullish(),
  transaction_date: z.string().nullish(),
});

export type DokuStoredNotification = z.infer<
  typeof DokuStoredNotificationSchema
>;
