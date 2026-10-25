import { createHmac, timingSafeEqual } from 'node:crypto';
import { sha256HexLower } from './signature-transaction';

export interface NotificationVerificationInput {
  externalId: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  body: unknown;
  secretKey: string;
}

/**
 * Verify a Jokul SNAP notification signature:
 * `HMAC-SHA512(`${X-EXTERNAL-ID}:${X-TIMESTAMP}:${sha256Hex(body)}`, secretKey)`
 * base64-encoded. When no secret is configured (dev/stub) verification is
 * skipped so local flows keep working without credentials.
 */
export function verifyNotificationSignature(
  input: NotificationVerificationInput,
): boolean {
  if (!input.secretKey) return true;
  if (!input.externalId || !input.timestamp || !input.signature) return false;

  const stringToSign = [
    input.externalId,
    input.timestamp,
    sha256HexLower(JSON.stringify(input.body)),
  ].join(':');
  const expected = createHmac('sha512', input.secretKey)
    .update(stringToSign)
    .digest('base64');

  const actual = Buffer.from(input.signature);
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}
