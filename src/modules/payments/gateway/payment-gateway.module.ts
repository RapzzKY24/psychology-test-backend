import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MidtransModule } from '../../midtrans/midtrans.module';
import { MidtransClient } from '../../midtrans/client/midtrans.client';
import { MidtransSnapProvider } from '../../midtrans/gateway/midtrans-snap.provider';
import { StubSnapProvider } from '../../midtrans/gateway/stub-snap.provider';
import { resolveProviderEnv } from '../../../common/constants/payment-provider';
import { PAYMENT_GATEWAY } from './payment-gateway.interface';
import type { PaymentGateway } from './payment-gateway.interface';

/**
 * Binds the transport for the provider named by `PAYMENT_PROVIDER`.
 *
 * `doku` is rejected on purpose: the enum values, the provider resolver and the
 * neutral notification type exist, but no Doku transport is bound yet. Letting
 * it through would hand the buyer a Snap URL while the order is recorded as
 * `DOKU_CHECKOUT` and its callback as `verifiedBySource: DOKU` — money still
 * arrives, the audit trail lies. Refusing to boot is the cheaper failure.
 */
export function createPaymentGateway(
  config: ConfigService,
  midtrans: MidtransClient,
): PaymentGateway {
  const provider = resolveProviderEnv(
    config.get<string>('app.paymentProvider'),
  );

  if (provider === 'doku') {
    throw new Error(
      'PAYMENT_PROVIDER=doku is not available in this build: no Doku transport is bound. ' +
        'Set PAYMENT_PROVIDER=midtrans, or deploy the build that adds src/modules/doku.',
    );
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
  imports: [MidtransModule],
  providers: [
    {
      provide: PAYMENT_GATEWAY,
      useFactory: createPaymentGateway,
      inject: [ConfigService, MidtransClient],
    },
  ],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentGatewayModule {}
