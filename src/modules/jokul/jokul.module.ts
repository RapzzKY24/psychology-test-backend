import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JokulClient } from './client/jokul.client';
import { JokulTokenProvider } from './client/jokul-token.provider';
import { PAYMENT_GATEWAY } from '../payments/gateway/payment-gateway.interface';
import { JokulVaProvider } from './gateway/jokul-va.provider';
import { StubVaProvider } from './gateway/stub-va.provider';

@Module({
  providers: [
    JokulTokenProvider,
    JokulClient,
    {
      // `JOKUL_STUB=true` swaps the transport for a deterministic in-memory
      // provider, so every VA flow (create, inquiry, reconcile) works offline.
      provide: PAYMENT_GATEWAY,
      useFactory: (config: ConfigService, jokul: JokulClient) =>
        config.get<boolean>('app.jokul.stub')
          ? new StubVaProvider()
          : new JokulVaProvider(jokul, config),
      inject: [ConfigService, JokulClient],
    },
  ],
  exports: [JokulClient, PAYMENT_GATEWAY],
})
export class JokulModule {}
