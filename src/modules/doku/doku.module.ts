import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DokuClient } from './client/doku.client';
import { DokuTokenProvider } from './client/doku-token.provider';
import { PAYMENT_GATEWAY } from './gateway/payment-gateway.interface';
import { DokuVaProvider } from './gateway/doku-va.provider';
import { StubVaProvider } from './gateway/stub-va.provider';

@Module({
  providers: [
    DokuTokenProvider,
    DokuClient,
    {
      // `DOKU_STUB=true` swaps the transport for a deterministic in-memory
      // provider, so every VA flow (create, inquiry, reconcile) works offline.
      provide: PAYMENT_GATEWAY,
      useFactory: (config: ConfigService, doku: DokuClient) =>
        config.get<boolean>('app.doku.stub')
          ? new StubVaProvider()
          : new DokuVaProvider(doku, config),
      inject: [ConfigService, DokuClient],
    },
  ],
  exports: [DokuClient, PAYMENT_GATEWAY],
})
export class DokuModule {}
