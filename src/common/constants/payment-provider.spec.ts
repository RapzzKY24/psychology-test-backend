import {
  PAYMENT_PROVIDER_ENV_TO_DB,
  resolveProviderEnv,
  toEventSource,
  toVerifiedBySource,
} from './payment-provider';

describe('resolveProviderEnv', () => {
  it('accepts every documented provider', () => {
    expect(resolveProviderEnv('manual')).toBe('manual');
    expect(resolveProviderEnv('midtrans')).toBe('midtrans');
    expect(resolveProviderEnv('doku')).toBe('doku');
  });

  it('falls back to midtrans so a typo never disables payments', () => {
    expect(resolveProviderEnv('doku-checkout')).toBe('midtrans');
    expect(resolveProviderEnv('')).toBe('midtrans');
    expect(resolveProviderEnv(undefined)).toBe('midtrans');
  });
});

describe('PAYMENT_PROVIDER_ENV_TO_DB', () => {
  it('maps every env value onto a DB enum value', () => {
    expect(PAYMENT_PROVIDER_ENV_TO_DB).toEqual({
      manual: 'MANUAL_QRIS',
      midtrans: 'MIDTRANS_SNAP',
      doku: 'DOKU_CHECKOUT',
    });
  });
});

describe('toEventSource', () => {
  it('names the provider that served the request', () => {
    expect(toEventSource('manual')).toBe('MANUAL');
    expect(toEventSource('midtrans')).toBe('MIDTRANS');
    expect(toEventSource('doku')).toBe('DOKU');
  });
});

describe('toVerifiedBySource', () => {
  it('attributes a manual settlement to the admin who cleared it', () => {
    expect(toVerifiedBySource('manual')).toBe('ADMIN');
    expect(toVerifiedBySource('midtrans')).toBe('MIDTRANS');
    expect(toVerifiedBySource('doku')).toBe('DOKU');
  });
});
