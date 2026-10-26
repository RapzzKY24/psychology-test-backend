import { z } from 'zod';

/**
 * Body sent to `POST /snap/v1/transactions`. `gross_amount` is an integer here
 * (Midtrans rejects decimals on the Snap request); `order_id` is limited to
 * alphanumerics and `- _ ~ .`, max 50 chars, and usable only once.
 */
export const SnapTransactionRequestSchema = z
  .object({
    transaction_details: z
      .object({
        order_id: z.string(),
        gross_amount: z.number().int(),
      })
      .passthrough(),
    expiry: z
      .object({
        start_time: z.string(),
        unit: z.literal('minute'),
        duration: z.number(),
      })
      .passthrough(),
    callbacks: z.object({ finish: z.string() }).passthrough(),
    customer_details: z
      .object({
        first_name: z.string(),
        email: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();
export type SnapTransactionRequest = z.infer<
  typeof SnapTransactionRequestSchema
>;

/** 201 response: only `token` and `redirect_url` are relied on. */
export const SnapTransactionResponseSchema = z
  .object({
    token: z.string(),
    redirect_url: z.string(),
  })
  .passthrough();
export type SnapTransactionResponse = z.infer<
  typeof SnapTransactionResponseSchema
>;

/**
 * Payment notification webhook. Unknown fields are kept, never rejected —
 * Midtrans adds fields over time and a strict schema would break the callback.
 * `gross_amount` is a decimal string ("200000.00"), unlike the Snap request.
 */
export const MidtransNotificationSchema = z
  .object({
    order_id: z.string(),
    status_code: z.string(),
    gross_amount: z.string(),
    signature_key: z.string(),
    transaction_status: z.string(),
    transaction_id: z.string().optional(),
    payment_type: z.string().optional(),
    fraud_status: z.string().optional(),
    status_message: z.string().optional(),
    transaction_time: z.string().optional(),
    expiry_time: z.string().optional(),
    va_numbers: z
      .array(
        z
          .object({
            bank: z.string(),
            va_number: z.string(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();
export type MidtransNotification = z.infer<typeof MidtransNotificationSchema>;

/**
 * Replay shape for a notification read back from the event log. The signature
 * is never persisted (it is derived from the server key), so a replayed
 * payload carries every field except `signature_key`.
 */
export const MidtransStoredNotificationSchema = MidtransNotificationSchema.omit({
  signature_key: true,
});
export type MidtransStoredNotification = z.infer<
  typeof MidtransStoredNotificationSchema
>;

/** `GET /v2/{order_id}/status`. `signature_key` is absent on some responses. */
export const MidtransStatusResponseSchema = z
  .object({
    order_id: z.string(),
    status_code: z.string(),
    transaction_status: z.string(),
    gross_amount: z.string(),
    fraud_status: z.string().optional(),
    payment_type: z.string().optional(),
    transaction_id: z.string().optional(),
    status_message: z.string().optional(),
    signature_key: z.string().optional(),
  })
  .passthrough();
export type MidtransStatusResponse = z.infer<
  typeof MidtransStatusResponseSchema
>;
