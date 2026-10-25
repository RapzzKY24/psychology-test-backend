import { z } from 'zod';

export const EventSourceSchema = z.enum(['JOKUL', 'MANUAL', 'MIDTRANS']);
export const EventDirectionSchema = z.enum(['INBOUND', 'OUTBOUND']);

export const RecordEventSchema = z.object({
  source: EventSourceSchema,
  direction: EventDirectionSchema,
  type: z.string().min(1),
  aggregateType: z.string().min(1).optional(),
  aggregateId: z.string().uuid().optional(),
  reference: z.string().optional(),
  idempotencyKey: z.string().optional(),
  payload: z.unknown().optional(),
});

export type RecordEventInput = z.infer<typeof RecordEventSchema>;

export interface MarkProcessedInput {
  response?: unknown;
  httpStatus?: number;
}

export interface MarkFailedInput {
  errorMessage: string;
}

export interface FindStaleInput {
  olderThan: Date;
  limit: number;
}
