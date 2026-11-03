import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MidtransModule } from '../../midtrans/midtrans.module';
import { MidtransClient } from '../../midtrans/client/midtrans.client';
import { MidtransSnapProvider } from '../../midtrans/gateway/midtrans-snap.provider';
import { StubSnapProvider } from '../../midtrans/gateway/stub-snap.provider';
import { DokuModule } from '../../doku/doku.module';
import { DokuClient } from '../../doku/client/doku.client';
import { DokuCheckoutProvider } from '../../doku/gateway/doku-checkout.provider';
import { StubDokuProvider } from '../../doku/gateway/stub-doku.provider';
import { resolveProviderEnv } from '../../../common/constants/payment-provider';
import { PAYMENT_GATEWAY } from './payment-gateway.interface';
import type { PaymentGateway } from './payment-gateway.interface';

/**
 * Binds the transport for the provider named by `PAYMENT_PROVIDER`.
 *
 * Each provider owns its own stub flag so a developer can fake one without
 * faking the other. `manual` still binds a transport: the payment services
 * disable themselves, and an unbound injection token would crash at boot.
 */
export function createPaymentGateway(
  config: ConfigService,
  midtrans: MidtransClient,
  doku: DokuClient,
): PaymentGateway {
  const provider = resolveProviderEnv(
    config.get<string>('app.paymentProvider'),
  );

  if (provider === 'doku') {
    return config.get<boolean>('app.doku.stub')
      ? new StubDokuProvider()
      : new DokuCheckoutProvider(doku, config);
  }

  return config.get<boolean>('app.midtrans.stub')
    ? new StubSnapProvider()
    : new MidtransSnapProvider(midtrans, config);
}

/**
 * The single place the active payment provider is chosen.
 *
 * Only this module binds `PAYMENT_GATEWAY`, so no other module ever sees a
 * transport. `PAYMENT_PROVIDER=manual` keeps the gateway unbound in practice:
 * the payment services disable themselves and no payment is created.
 */
@Module({
  imports: [MidtransModule, DokuModule],
  providers: [
    {
      provide: PAYMENT_GATEWAY,
      useFactory: createPaymentGateway,
      inject: [ConfigService, MidtransClient, DokuClient],
    },
  ],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentGatewayModule {}
