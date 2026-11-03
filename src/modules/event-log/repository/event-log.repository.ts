import type { Prisma } from '../../../generated/prisma/client';
import type { MarkFailedInput, MarkProcessedInput } from '../dto/event-log.dto';
import type { EventSourceSchema } from '../dto/event-log.dto';
import type { z } from 'zod';

export const EVENT_LOG_REPOSITORY = 'EventLogRepository';

/** Derived from the Zod enum so the two can never drift. */
export type EventSource = z.infer<typeof EventSourceSchema>;
export type EventDirection = 'INBOUND' | 'OUTBOUND';
export type EventStatus =
  'RECEIVED' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'DUPLICATE';

export interface EventLogRecord {
  id: string;
  source: EventSource;
  direction: EventDirection;
  type: string;
  status: EventStatus;
  aggregateType: string | null;
  aggregateId: string | null;
  reference: string | null;
  idempotencyKey: string | null;
  payload: Prisma.JsonValue | null;
  response: Prisma.JsonValue | null;
  httpStatus: number | null;
  errorMessage: string | null;
  attempts: number;
  createdAt: Date;
  processedAt: Date | null;
  updatedAt: Date;
}

export interface CreateEventInput {
  source: EventSource;
  direction: EventDirection;
  type: string;
  aggregateType?: string;
  aggregateId?: string;
  reference?: string;
  idempotencyKey?: string;
  payload?: unknown;
}

export interface EventLogRepository {
  /** Append a new event with status RECEIVED, attempts = 1. */
  create(input: CreateEventInput): Promise<EventLogRecord>;
  markProcessing(id: string): Promise<void>;
  markProcessed(id: string, result: MarkProcessedInput): Promise<void>;
  markFailed(id: string, result: MarkFailedInput): Promise<void>;
  /** Events still awaiting processing (RECEIVED/PROCESSING) older than a cutoff. */
  findStaleForRecovery(params: {
    olderThan: Date;
    limit: number;
  }): Promise<EventLogRecord[]>;
}
