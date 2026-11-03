import type { ConfigService } from '@nestjs/config';
import { MidtransSnapProvider } from '../../midtrans/gateway/midtrans-snap.provider';
import { StubSnapProvider } from '../../midtrans/gateway/stub-snap.provider';
import type { MidtransClient } from '../../midtrans/client/midtrans.client';
import { DokuCheckoutProvider } from '../../doku/gateway/doku-checkout.provider';
import { StubDokuProvider } from '../../doku/gateway/stub-doku.provider';
import type { DokuClient } from '../../doku/client/doku.client';
import { createPaymentGateway } from '../gateway/payment-gateway.module';

/** Only the lookups the factory makes; anything else is a bug. */
function config(settings: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: unknown) =>
      key in settings ? settings[key] : fallback,
    ),
  } as unknown as ConfigService;
}

const midtrans = {} as MidtransClient;
const doku = {} as DokuClient;

describe('createPaymentGateway', () => {
  it('binds Doku Checkout for doku', () => {
    const gateway = createPaymentGateway(
      config({ 'app.paymentProvider': 'doku' }),
      midtrans,
      doku,
    );

    expect(gateway).toBeInstanceOf(DokuCheckoutProvider);
  });

  it('binds the Doku stub without touching the Snap stub flag', () => {
    const gateway = createPaymentGateway(
      config({
        'app.paymentProvider': 'doku',
        'app.doku.stub': true,
        'app.midtrans.stub': false,
      }),
      midtrans,
      doku,
    );

    expect(gateway).toBeInstanceOf(StubDokuProvider);
  });

  it('binds Snap for midtrans', () => {
    const gateway = createPaymentGateway(
      config({ 'app.paymentProvider': 'midtrans' }),
      midtrans,
      doku,
    );

    expect(gateway).toBeInstanceOf(MidtransSnapProvider);
  });

  it('binds the Snap stub when its flag is on', () => {
    const gateway = createPaymentGateway(
      config({ 'app.paymentProvider': 'midtrans', 'app.midtrans.stub': true }),
      midtrans,
      doku,
    );

    expect(gateway).toBeInstanceOf(StubSnapProvider);
  });

  it('falls back to Snap for an unset or unknown provider', () => {
    expect(createPaymentGateway(config({}), midtrans, doku)).toBeInstanceOf(
      MidtransSnapProvider,
    );
    expect(
      createPaymentGateway(
        config({ 'app.paymentProvider': 'midtranss' }),
        midtrans,
        doku,
      ),
    ).toBeInstanceOf(MidtransSnapProvider);
  });

  it('keeps a transport bound for manual so injection never fails', () => {
    // The payment services disable themselves; the token still has to resolve.
    expect(
      createPaymentGateway(
        config({ 'app.paymentProvider': 'manual' }),
        midtrans,
        doku,
      ),
    ).toBeInstanceOf(MidtransSnapProvider);
  });
});
