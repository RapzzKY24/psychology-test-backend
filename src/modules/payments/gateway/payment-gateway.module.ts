import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JokulModule } from '../../jokul/jokul.module';
import { JokulClient } from '../../jokul/client/jokul.client';
import { JokulVaProvider } from '../../jokul/gateway/jokul-va.provider';
import { StubVaProvider } from '../../jokul/gateway/stub-va.provider';
import { MidtransModule } from '../../midtrans/midtrans.module';
import { MidtransClient } from '../../midtrans/client/midtrans.client';
import { MidtransSnapProvider } from '../../midtrans/gateway/midtrans-snap.provider';
import { StubSnapProvider } from '../../midtrans/gateway/stub-snap.provider';
import { PAYMENT_GATEWAY } from './payment-gateway.interface';
import type { PaymentGateway } from './payment-gateway.interface';

/**
 * The single place the active payment provider is chosen.
 *
 * Both transport modules register their client and provider classes, but only
 * this module binds `PAYMENT_GATEWAY`, so importing Jokul and Midtrans into the
 * same graph is no longer ambiguous. Selection follows `PAYMENT_PROVIDER`:
 * `midtrans` is the active implementation, while `jokul` stays selectable as a
 * rollback path. `PAYMENT_PROVIDER=manual` keeps the gateway unbound in
 * practice: the services disable themselves and no payment is created.
 */
@Module({
  imports: [JokulModule, MidtransModule],
  providers: [
    {
      provide: PAYMENT_GATEWAY,
      useFactory: (
        config: ConfigService,
        jokul: JokulClient,
        midtrans: MidtransClient,
      ): PaymentGateway => {
        const provider = config.get<string>('app.paymentProvider') ?? 'jokul';
        if (provider === 'midtrans') {
          return config.get<boolean>('app.midtrans.stub')
            ? new StubSnapProvider()
            : new MidtransSnapProvider(midtrans, config);
        }
        return config.get<boolean>('app.jokul.stub')
          ? new StubVaProvider()
          : new JokulVaProvider(jokul, config);
      },
      inject: [ConfigService, JokulClient, MidtransClient],
    },
  ],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentGatewayModule {}
