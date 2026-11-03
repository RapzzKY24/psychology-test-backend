import type { ConfigService } from '@nestjs/config';
import { MidtransSnapProvider } from '../../midtrans/gateway/midtrans-snap.provider';
import { StubSnapProvider } from '../../midtrans/gateway/stub-snap.provider';
import type { MidtransClient } from '../../midtrans/client/midtrans.client';
import { createPaymentGateway } from '../gateway/payment-gateway.module';

/** Only the two lookups the factory makes; anything else is a bug. */
function config(settings: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: unknown) =>
      key in settings ? settings[key] : fallback,
    ),
  } as unknown as ConfigService;
}

const midtrans = {} as MidtransClient;

describe('createPaymentGateway', () => {
  it('refuses to boot when doku is selected but not bound', () => {
    // The half-configured state is worse than a crash: buyers would get a Snap
    // URL while every row says DOKU_CHECKOUT.
    expect(() =>
      createPaymentGateway(config({ 'app.paymentProvider': 'doku' }), midtrans),
    ).toThrow(/PAYMENT_PROVIDER=doku is not available in this build/);
  });

  it('binds Snap for midtrans', () => {
    const gateway = createPaymentGateway(
      config({ 'app.paymentProvider': 'midtrans' }),
      midtrans,
    );

    expect(gateway).toBeInstanceOf(MidtransSnapProvider);
  });

  it('binds the stub instead of Snap when the stub flag is on', () => {
    const gateway = createPaymentGateway(
      config({ 'app.paymentProvider': 'midtrans', 'app.midtrans.stub': true }),
      midtrans,
    );

    expect(gateway).toBeInstanceOf(StubSnapProvider);
  });

  it('falls back to Snap for an unset or unknown provider', () => {
    expect(createPaymentGateway(config({}), midtrans)).toBeInstanceOf(
      MidtransSnapProvider,
    );
    expect(
      createPaymentGateway(
        config({ 'app.paymentProvider': 'midtranss' }),
        midtrans,
      ),
    ).toBeInstanceOf(MidtransSnapProvider);
  });
});
