import { Inject, Injectable } from '@nestjs/common';
import { IdempotencyInProgressError } from '../errors/idempotency.error';
import { BeginIdempotencySchema } from '../dto/idempotency.dto';
import type {
  BeginIdempotencyInput,
  CompleteIdempotencyInput,
  FailIdempotencyInput,
} from '../dto/idempotency.dto';
import { parseOrThrow } from '../../../common/utils/zod-parse';
import {
  IDEMPOTENCY_DEFAULT_RESPONSE_STATUS,
  MS_PER_MINUTE,
} from '../constants/idempotency';
import { IDEMPOTENCY_REPOSITORY } from '../repository/idempotency.repository';
import type {
  IdempotencyRecord,
  IdempotencyRepository,
} from '../repository/idempotency.repository';

export type BeginResult =
  | { acquired: true; id: string }
  | { acquired: false; existing: IdempotencyRecord };

@Injectable()
export class IdempotencyService {
  constructor(
    @Inject(IDEMPOTENCY_REPOSITORY)
    private readonly repo: IdempotencyRepository,
  ) {}

  private isUniqueViolation(error: unknown): boolean {
    return (error as { code?: string } | null)?.code === 'P2002';
  }

  /**
   * Claim a keyed operation. Insert wins ⇒ `acquired: true`; a duplicate key
   * (Prisma P2002) ⇒ `acquired: false` with the existing claim.
   */
  async begin(input: BeginIdempotencyInput): Promise<BeginResult> {
    const parsed = parseOrThrow(BeginIdempotencySchema, input);
    const expiresAt = parsed.ttlMinutes
      ? new Date(Date.now() + parsed.ttlMinutes * MS_PER_MINUTE)
      : undefined;
    try {
      const record = await this.repo.create({
        key: parsed.key,
        scope: parsed.scope,
        requestHash: parsed.requestHash,
        expiresAt,
      });
      return { acquired: true, id: record.id };
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const existing = await this.repo.findByKey(parsed.key);
      if (!existing) throw error;
      return { acquired: false, existing };
    }
  }

  complete(id: string, result: CompleteIdempotencyInput): Promise<void> {
    return this.repo.complete(id, result);
  }

  fail(id: string, result: FailIdempotencyInput): Promise<void> {
    return this.repo.fail(id, result);
  }

  /**
   * Claim, run, and record. On a duplicate key returns the stored result of the
   * first successful run; on a duplicate that never completed it throws
   * `IdempotencyInProgressError`. `fn` runs at most once.
   */
  async run<T>(input: BeginIdempotencyInput, fn: () => Promise<T>): Promise<T> {
    const claim = await this.begin(input);
    if (!claim.acquired) {
      const { existing } = claim;
      if (existing.status === 'COMPLETED' && existing.responseBody !== null) {
        return existing.responseBody as T;
      }
      throw new IdempotencyInProgressError(existing.key);
    }
    try {
      const value = await fn();
      await this.complete(claim.id, {
        responseStatus: IDEMPOTENCY_DEFAULT_RESPONSE_STATUS,
        responseBody: value,
      });
      return value;
    } catch (error) {
      await this.fail(claim.id, {
        errorMessage: error instanceof Error ? error.message : 'unknown_error',
      });
      throw error;
    }
  }
}
