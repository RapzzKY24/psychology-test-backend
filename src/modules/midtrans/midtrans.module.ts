import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MidtransClient } from './client/midtrans.client';
import { PAYMENT_GATEWAY } from '../payments/gateway/payment-gateway.interface';
import { MidtransSnapProvider } from './gateway/midtrans-snap.provider';
import { StubSnapProvider } from './gateway/stub-snap.provider';

@Module({
  providers: [
    MidtransClient,
    {
      // `MIDTRANS_STUB=true` swaps the transport for a deterministic in-memory
      // provider, so every Snap flow (create, redirect, status) works offline.
      provide: PAYMENT_GATEWAY,
      useFactory: (config: ConfigService, client: MidtransClient) =>
        config.get<boolean>('app.midtrans.stub')
          ? new StubSnapProvider()
          : new MidtransSnapProvider(client, config),
      inject: [ConfigService, MidtransClient],
    },
  ],
  exports: [PAYMENT_GATEWAY, MidtransClient],
})
export class MidtransModule {}
