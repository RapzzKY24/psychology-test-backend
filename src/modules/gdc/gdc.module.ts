import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GdcClient } from './client/gdc.client';
import { GdcTokenProvider } from './client/gdc-token.provider';
import { PAYMENT_GATEWAY } from './gateway/payment-gateway.interface';
import { GdcVaProvider } from './gateway/gdc-va.provider';
import { StubVaProvider } from './gateway/stub-va.provider';

@Module({
  providers: [
    GdcTokenProvider,
    GdcClient,
    {
      // `GDC_STUB=true` swaps the transport for a deterministic in-memory
      // provider, so every VA flow (create, inquiry, reconcile) works offline.
      provide: PAYMENT_GATEWAY,
      useFactory: (config: ConfigService, gdc: GdcClient) =>
        config.get<boolean>('app.gdcStub')
          ? new StubVaProvider()
          : new GdcVaProvider(gdc, config),
      inject: [ConfigService, GdcClient],
    },
  ],
  exports: [GdcClient, PAYMENT_GATEWAY],
})
export class GdcModule {}
