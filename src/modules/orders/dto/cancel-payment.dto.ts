import { z } from 'zod';

export const CancelPaymentSchema = z.object({
  reason: z.string().min(1).max(500),
});

export type CancelPaymentDto = z.infer<typeof CancelPaymentSchema>;
