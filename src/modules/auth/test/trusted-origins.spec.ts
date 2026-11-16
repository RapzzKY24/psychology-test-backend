import { trustedAuthOrigins } from '../trusted-origins';

describe('trustedAuthOrigins', () => {
  it('uses configured production origins without trusting localhost', () => {
    expect(trustedAuthOrigins({
      NODE_ENV: 'production',
      BETTER_AUTH_URL: 'https://api.example.test',
      BETTER_AUTH_TRUSTED_ORIGINS: 'https://app.example.test, https://www.example.test',
    })).toEqual([
      'https://api.example.test',
      'https://app.example.test',
      'https://www.example.test',
    ]);
  });

  it('rejects a malformed configured origin', () => {
    expect(() => trustedAuthOrigins({
      NODE_ENV: 'production',
      BETTER_AUTH_TRUSTED_ORIGINS: 'https://app.example.test/path',
    })).toThrow('Invalid auth origin');
  });

  it('requires an auth origin in production', () => {
    expect(() => trustedAuthOrigins({ NODE_ENV: 'production' })).toThrow(
      'BETTER_AUTH_URL or BETTER_AUTH_TRUSTED_ORIGINS is required',
    );
  });
});
