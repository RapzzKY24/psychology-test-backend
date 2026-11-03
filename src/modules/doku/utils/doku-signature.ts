import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Doku's `Request-Timestamp` is ISO-8601 UTC **without milliseconds**.
 * `2026-11-03T09:15:00.123Z` fails every signature check, so the fraction is
 * stripped before it is both sent and signed.
 */
export function formatDokuTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** `base64(SHA256(rawBody))` — POST bodies only. */
export function generateDigest(rawBody: string): string {
  return createHash('sha256').update(rawBody, 'utf8').digest('base64');
}

export interface SignatureComponentInput {
  clientId: string;
  requestId: string;
  timestamp: string;
  requestTarget: string;
  digest?: string;
}

/**
 * The component is labelled lines joined by newlines, not a concatenation.
 * `Digest` is present only when there is a body.
 */
export function buildSignatureComponent(
  input: SignatureComponentInput,
): string {
  const lines = [
    `Client-Id:${input.clientId}`,
    `Request-Id:${input.requestId}`,
    `Request-Timestamp:${input.timestamp}`,
    `Request-Target:${input.requestTarget}`,
  ];
  if (input.digest) lines.push(`Digest:${input.digest}`);
  return lines.join('\n');
}

/** `HMACSHA256=<base64>` — the value of the `Signature` header. */
export function signComponent(secretKey: string, component: string): string {
  const signature = createHmac('sha256', secretKey)
    .update(component, 'utf8')
    .digest('base64');
  return `HMACSHA256=${signature}`;
}

function readHeader(
  headers: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const value = headers[key.toLowerCase()];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export interface VerifyDokuSignatureInput {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  clientId: string;
  secretKey: string;
  /** The Notification URL registered in the Doku dashboard, as a path. */
  notificationPath: string;
}

/**
 * Verify an inbound callback against the raw body.
 *
 * `notificationPath` is configuration, never derived from the request: nginx or
 * Cloudflare rewriting the path would change the component and reject every
 * callback. An empty secret skips verification so local/stub flows work without
 * credentials, matching `verifyMidtransSignature`.
 */
export function verifyDokuSignature(input: VerifyDokuSignatureInput): boolean {
  if (!input.secretKey) return true;

  const requestId = readHeader(input.headers, 'request-id');
  const timestamp = readHeader(input.headers, 'request-timestamp');
  const signature = readHeader(input.headers, 'signature');
  if (!requestId || !timestamp || !signature) return false;

  const expected = signComponent(
    input.secretKey,
    buildSignatureComponent({
      clientId: input.clientId,
      requestId,
      timestamp,
      requestTarget: input.notificationPath,
      digest: generateDigest(input.rawBody),
    }),
  );

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(signature, 'utf8');
  if (expectedBuffer.length !== actualBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
