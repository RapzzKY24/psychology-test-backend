import { createHash, createHmac } from 'node:crypto';
import {
  buildSignatureComponent,
  formatDokuTimestamp,
  generateDigest,
  signComponent,
  verifyDokuSignature,
} from '../utils/doku-signature';

const CLIENT_ID = 'BRN-0295-test';
const SECRET = 'SK-test-secret';
const PATH = '/api/v1/webhooks/doku/notification';

describe('formatDokuTimestamp', () => {
  it('strips milliseconds — Doku rejects a fractional timestamp', () => {
    expect(formatDokuTimestamp(new Date('2026-11-03T09:15:00.123Z'))).toBe(
      '2026-11-03T09:15:00Z',
    );
  });
});

describe('generateDigest', () => {
  it('is base64(SHA256(body))', () => {
    const body = '{"a":1}';
    expect(generateDigest(body)).toBe(
      createHash('sha256').update(body, 'utf8').digest('base64'),
    );
  });
});

describe('buildSignatureComponent', () => {
  it('joins labelled lines and appends the digest last', () => {
    expect(
      buildSignatureComponent({
        clientId: CLIENT_ID,
        requestId: 'req-1',
        timestamp: '2026-11-03T09:15:00Z',
        requestTarget: '/checkout/v1/payment',
        digest: 'abc',
      }),
    ).toBe(
      [
        `Client-Id:${CLIENT_ID}`,
        'Request-Id:req-1',
        'Request-Timestamp:2026-11-03T09:15:00Z',
        'Request-Target:/checkout/v1/payment',
        'Digest:abc',
      ].join('\n'),
    );
  });

  it('omits the digest line for a bodyless request', () => {
    const component = buildSignatureComponent({
      clientId: CLIENT_ID,
      requestId: 'req-1',
      timestamp: '2026-11-03T09:15:00Z',
      requestTarget: '/orders/v1/status/x',
    });

    expect(component).not.toContain('Digest:');
    expect(component.split('\n')).toHaveLength(4);
  });
});

describe('signComponent', () => {
  it('prefixes the base64 HMAC-SHA256', () => {
    const component = 'Client-Id:x';
    const expected = createHmac('sha256', SECRET)
      .update(component, 'utf8')
      .digest('base64');

    expect(signComponent(SECRET, component)).toBe(`HMACSHA256=${expected}`);
  });
});

describe('verifyDokuSignature', () => {
  const body = '{"order":{"invoice_number":"INV-1"}}';

  function headers(overrides: Record<string, string> = {}) {
    return {
      'request-id': 'req-1',
      'request-timestamp': '2026-11-03T09:15:00Z',
      signature: signComponent(
        SECRET,
        buildSignatureComponent({
          clientId: CLIENT_ID,
          requestId: 'req-1',
          timestamp: '2026-11-03T09:15:00Z',
          requestTarget: PATH,
          digest: generateDigest(body),
        }),
      ),
      ...overrides,
    };
  }

  function verify(overrides: Record<string, unknown> = {}) {
    return verifyDokuSignature({
      headers: headers(),
      rawBody: body,
      clientId: CLIENT_ID,
      secretKey: SECRET,
      notificationPath: PATH,
      ...overrides,
    });
  }

  it('accepts a correctly signed body', () => {
    expect(verify()).toBe(true);
  });

  it('rejects a body that changed after signing', () => {
    expect(verify({ rawBody: '{"order":{"invoice_number":"INV-2"}}' })).toBe(
      false,
    );
  });

  it('rejects a signature made for a different request target', () => {
    // The path is configuration, not something read off the request: a proxy
    // rewriting the URL must not silently invalidate every callback.
    expect(verify({ notificationPath: '/other/path' })).toBe(false);
  });

  it('rejects when the signature header is missing', () => {
    expect(verify({ headers: { 'request-id': 'req-1' } })).toBe(false);
  });

  it('rejects a signature of a different length without throwing', () => {
    expect(
      verify({ headers: headers({ signature: 'HMACSHA256=short' }) }),
    ).toBe(false);
  });

  it('skips verification when no secret key is configured', () => {
    expect(verify({ secretKey: '' })).toBe(true);
  });
});
