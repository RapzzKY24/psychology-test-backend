import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MidtransModule } from '../../midtrans/midtrans.module';
import { MidtransClient } from '../../midtrans/client/midtrans.client';
import { MidtransSnapProvider } from '../../midtrans/gateway/midtrans-snap.provider';
import { StubSnapProvider } from '../../midtrans/gateway/stub-snap.provider';
import { PAYMENT_GATEWAY } from './payment-gateway.interface';
import type { PaymentGateway } from './payment-gateway.interface';

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
      useFactory: (
        config: ConfigService,
        midtrans: MidtransClient,
      ): PaymentGateway =>
        config.get<boolean>('app.midtrans.stub')
          ? new StubSnapProvider()
          : new MidtransSnapProvider(midtrans, config),
      inject: [ConfigService, MidtransClient],
    },
  ],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentGatewayModule {}
