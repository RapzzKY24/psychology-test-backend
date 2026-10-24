import { createHash } from 'node:crypto';

/**
 * Deterministic 16-digit `customerNo` derived from the caller's external id.
 * Doku requires `virtualAccountNo = partnerServiceId + customerNo` to be
 * unique per transaction, and retries must reuse the same number.
 */
export function customerNoFromExternalId(externalId: string): string {
  const digest = createHash('sha256').update(externalId).digest('hex');
  const numeric = (BigInt(`0x${digest.slice(0, 16)}`) % 10_000_000_000_000_000n)
    .toString()
    .padStart(16, '0');
  return numeric;
}
