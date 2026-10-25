import { createHash } from 'node:crypto';
import { verifyMidtransSignature } from '../utils/verify-signature';

const SERVER_KEY = 'SB-Mid-server-test-key';
const ORDER_ID = 'INV-2026-0001';
const STATUS_CODE = '200';
const GROSS_AMOUNT = '200000.00';

function sign(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
): string {
  return createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');
}

describe('verifyMidtransSignature', () => {
  const signatureKey = sign(ORDER_ID, STATUS_CODE, GROSS_AMOUNT, SERVER_KEY);

  it('accepts a signature computed over order id, status, amount and server key', () => {
    expect(
      verifyMidtransSignature({
        orderId: ORDER_ID,
        statusCode: STATUS_CODE,
        grossAmount: GROSS_AMOUNT,
        signatureKey,
        serverKey: SERVER_KEY,
      }),
    ).toBe(true);
  });

  it('rejects a signature with one changed character', () => {
    const tampered =
      signatureKey.slice(0, -1) + (signatureKey.endsWith('0') ? '1' : '0');

    expect(
      verifyMidtransSignature({
        orderId: ORDER_ID,
        statusCode: STATUS_CODE,
        grossAmount: GROSS_AMOUNT,
        signatureKey: tampered,
        serverKey: SERVER_KEY,
      }),
    ).toBe(false);
  });

  it('rejects a signature built with a different server key', () => {
    expect(
      verifyMidtransSignature({
        orderId: ORDER_ID,
        statusCode: STATUS_CODE,
        grossAmount: GROSS_AMOUNT,
        signatureKey: sign(ORDER_ID, STATUS_CODE, GROSS_AMOUNT, 'other-key'),
        serverKey: SERVER_KEY,
      }),
    ).toBe(false);
  });

  it('rejects a tampered gross amount', () => {
    expect(
      verifyMidtransSignature({
        orderId: ORDER_ID,
        statusCode: STATUS_CODE,
        grossAmount: '200001.00',
        signatureKey,
        serverKey: SERVER_KEY,
      }),
    ).toBe(false);
  });

  it('skips verification when no server key is configured (dev/stub)', () => {
    expect(
      verifyMidtransSignature({
        orderId: ORDER_ID,
        statusCode: STATUS_CODE,
        grossAmount: GROSS_AMOUNT,
        signatureKey: 'not-a-real-signature',
        serverKey: '',
      }),
    ).toBe(true);
  });

  it('returns false for a signature of a different length without throwing', () => {
    expect(
      verifyMidtransSignature({
        orderId: ORDER_ID,
        statusCode: STATUS_CODE,
        grossAmount: GROSS_AMOUNT,
        signatureKey: 'deadbeef',
        serverKey: SERVER_KEY,
      }),
    ).toBe(false);
  });
});
