import { Module } from '@nestjs/common';
import { JokulClient } from './client/jokul.client';
import { JokulTokenProvider } from './client/jokul-token.provider';
import { JokulVaProvider } from './gateway/jokul-va.provider';
import { StubVaProvider } from './gateway/stub-va.provider';

@Module({
  providers: [
    JokulTokenProvider,
    JokulClient,
    JokulVaProvider,
    // `JOKUL_STUB=true` swaps the transport for a deterministic in-memory
    // provider, so every VA flow (create, inquiry, reconcile) works offline.
    StubVaProvider,
  ],
  exports: [JokulClient, JokulVaProvider, StubVaProvider],
})
export class JokulModule {}
