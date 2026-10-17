import { Inject, Injectable } from '@nestjs/common';
import { BeginIdempotencySchema } from '../dto/idempotency.dto';
import type {
  BeginIdempotencyInput,
  CompleteIdempotencyInput,
} from '../dto/idempotency.dto';
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
    const parsed = BeginIdempotencySchema.parse(input);
    const expiresAt = parsed.ttlMinutes
      ? new Date(Date.now() + parsed.ttlMinutes * 60 * 1000)
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

  fail(id: string): Promise<void> {
    return this.repo.fail(id);
  }
}
