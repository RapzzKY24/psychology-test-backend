import { createHmac } from 'node:crypto';
import { createHash } from 'node:crypto';
import { verifyNotificationSignature } from '../utils/verify-notification';

describe('verifyNotificationSignature', () => {
  const body = { virtualAccountNo: '00012345', trxId: 'o1' };
  const digest = createHash('sha256')
    .update(JSON.stringify(body))
    .digest('hex')
    .toLowerCase();
  const stringToSign = `ext-1:2026-10-24T10:00:00+07:00:${digest}`;
  const signature = createHmac('sha512', 'secret')
    .update(stringToSign)
    .digest('base64');

  it('accepts a signature computed over external id, timestamp and body', () => {
    expect(
      verifyNotificationSignature({
        externalId: 'ext-1',
        timestamp: '2026-10-24T10:00:00+07:00',
        signature,
        body,
        secretKey: 'secret',
      }),
    ).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(
      verifyNotificationSignature({
        externalId: 'ext-1',
        timestamp: '2026-10-24T10:00:00+07:00',
        signature,
        body: { ...body, trxId: 'o2' },
        secretKey: 'secret',
      }),
    ).toBe(false);
  });

  it('rejects missing signature headers when a secret is configured', () => {
    expect(
      verifyNotificationSignature({
        externalId: undefined,
        timestamp: undefined,
        signature: undefined,
        body,
        secretKey: 'secret',
      }),
    ).toBe(false);
  });

  it('skips verification when no secret is configured (dev/stub)', () => {
    expect(
      verifyNotificationSignature({
        externalId: undefined,
        timestamp: undefined,
        signature: undefined,
        body,
        secretKey: '',
      }),
    ).toBe(true);
  });
});
