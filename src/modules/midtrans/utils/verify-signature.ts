import { createHash, timingSafeEqual } from 'node:crypto';

export interface VerifyMidtransSignatureInput {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  signatureKey: string;
  serverKey: string;
}

/**
 * Verify a Midtrans HTTP notification signature:
 * `SHA512(order_id + status_code + gross_amount + serverKey)`, hex-encoded,
 * compared against the `signature_key` field.
 *
 * When `serverKey` is an empty string verification is skipped and `true` is
 * returned, mirroring the Jokul verifier: dev/stub mode keeps local flows
 * working without credentials.
 *
 * Neither the server key nor the signature is ever logged.
 */
export function verifyMidtransSignature(
  input: VerifyMidtransSignatureInput,
): boolean {
  if (!input.serverKey) return true;

  const expected = createHash('sha512')
    .update(
      `${input.orderId}${input.statusCode}${input.grossAmount}${input.serverKey}`,
    )
    .digest('hex');

  const actualBuffer = Buffer.from(input.signatureKey);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(actualBuffer, expectedBuffer);
}
