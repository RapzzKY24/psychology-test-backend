import { createHash, createHmac } from 'node:crypto';

export interface TransactionSignatureInput {
  method: string;
  path: string;
  tokenB2B: string;
  /** Raw JSON request body exactly as sent; empty string when there is none. */
  payload: string;
  timestamp: string;
  clientSecret: string;
}

export function sha256HexLower(payload: string): string {
  return createHash('sha256').update(payload).digest('hex').toLowerCase();
}

/**
 * SNAP transaction signature (symmetric).
 * stringToSign = `${METHOD}:${path}:${tokenB2B}:${lowercaseHexSha256(payload)}:${timestamp}`
 * signature = base64(HMAC-SHA512(stringToSign, clientSecret)).
 */
export function signTransaction(input: TransactionSignatureInput): string {
  const payloadEncoded =
    input.payload === '' ? '' : sha256HexLower(input.payload);
  const stringToSign = [
    input.method.toUpperCase(),
    input.path,
    input.tokenB2B,
    payloadEncoded,
    input.timestamp,
  ].join(':');
  return createHmac('sha512', input.clientSecret)
    .update(stringToSign)
    .digest('base64');
}
