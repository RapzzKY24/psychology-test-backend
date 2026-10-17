import type { Prisma } from '../../../generated/prisma/client';

export const IDEMPOTENCY_REPOSITORY = 'IdempotencyRepository';

export type IdempotencyRecordStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface IdempotencyRecord {
  id: string;
  key: string;
  scope: string;
  requestHash: string | null;
  status: IdempotencyRecordStatus;
  responseStatus: number | null;
  responseBody: Prisma.JsonValue | null;
  lockedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateIdempotencyInput {
  key: string;
  scope: string;
  requestHash?: string;
  expiresAt?: Date;
}

export interface IdempotencyRepository {
  /** Insert a new guard row. Throws Prisma P2002 when the key already exists. */
  create(input: CreateIdempotencyInput): Promise<IdempotencyRecord>;
  findByKey(key: string): Promise<IdempotencyRecord | null>;
  complete(
    id: string,
    result: { responseStatus: number; responseBody?: unknown },
  ): Promise<void>;
  fail(id: string): Promise<void>;
}
