import {
  createHash,
  createHmac,
  createVerify,
  generateKeyPairSync,
} from 'node:crypto';
import { signAccessToken } from '../utils/signature-access-token';
import {
  sha256HexLower,
  signTransaction,
} from '../utils/signature-transaction';
import { isoTimestamp } from '../utils/timestamp';

describe('signAccessToken', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  it('produces an RSA-SHA256 signature verifiable with the public key', () => {
    const timestamp = '2026-10-17T12:34:56+07:00';
    const signature = signAccessToken('client-key', timestamp, privateKey);

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`client-key|${timestamp}`);
    verifier.end();

    expect(verifier.verify(publicKey, signature, 'base64')).toBe(true);
  });

  it('fails verification when stringToSign differs', () => {
    const signature = signAccessToken(
      'client-key',
      '2026-10-17T12:34:56+07:00',
      privateKey,
    );
    const verifier = createVerify('RSA-SHA256');
    verifier.update('other|2026-10-17T12:34:56+07:00');
    verifier.end();

    expect(verifier.verify(publicKey, signature, 'base64')).toBe(false);
  });
});

describe('signTransaction', () => {
  it('matches the documented SNAP formula', () => {
    const input = {
      method: 'POST',
      path: '/v1.0/transfer-va/create-va',
      tokenB2B: 'tok',
      payload: '{"a":1}',
      timestamp: '2026-10-17T12:34:56+07:00',
      clientSecret: 'secret',
    };

    const payloadEncoded = createHash('sha256')
      .update(input.payload)
      .digest('hex')
      .toLowerCase();
    const stringToSign = [
      'POST',
      input.path,
      'tok',
      payloadEncoded,
      input.timestamp,
    ].join(':');
    const expected = createHmac('sha512', 'secret')
      .update(stringToSign)
      .digest('base64');

    expect(signTransaction(input)).toBe(expected);
  });

  it('encodes an empty payload as an empty string', () => {
    const input = {
      method: 'GET',
      path: '/x',
      tokenB2B: 't',
      payload: '',
      timestamp: 'ts',
      clientSecret: 's',
    };
    const expected = createHmac('sha512', 's')
      .update('GET:/x:t::ts')
      .digest('base64');

    expect(signTransaction(input)).toBe(expected);
  });

  it('uppercases the HTTP method', () => {
    const base = {
      path: '/x',
      tokenB2B: 't',
      payload: '',
      timestamp: 'ts',
      clientSecret: 's',
    };
    expect(signTransaction({ ...base, method: 'post' })).toBe(
      signTransaction({ ...base, method: 'POST' }),
    );
  });

  it('hashes the payload with lowercase sha256 hex', () => {
    const hex = sha256HexLower('{"a":1}');
    expect(hex).toBe(hex.toLowerCase());
    expect(hex).toHaveLength(64);
  });
});

describe('isoTimestamp', () => {
  it('formats with +07:00 offset and second precision', () => {
    expect(isoTimestamp(new Date('2026-10-17T05:34:56Z'))).toBe(
      '2026-10-17T12:34:56+07:00',
    );
  });
});
