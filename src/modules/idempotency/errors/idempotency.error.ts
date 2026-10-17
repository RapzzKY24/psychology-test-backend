/**
 * A duplicate `run` hit a key that is claimed but never completed. Domain-level
 * so callers map it to the right HTTP response (this module owns no routes).
 */
export class IdempotencyInProgressError extends Error {
  constructor(readonly key: string) {
    super(`Idempotent operation still in progress for key: ${key}`);
    this.name = 'IdempotencyInProgressError';
  }
}
