import { createSign } from 'node:crypto';

/**
 * SNAP access-token signature (asymmetric).
 * stringToSign = `${clientKey}|${timestamp}`; sign with RSA-SHA256 (PKCS#1 v1.5).
 */
export function signAccessToken(
  clientKey: string,
  timestamp: string,
  privateKey: string,
): string {
  const stringToSign = `${clientKey}|${timestamp}`;
  const signer = createSign('RSA-SHA256');
  signer.update(stringToSign);
  signer.end();
  return signer.sign(privateKey, 'base64');
}
