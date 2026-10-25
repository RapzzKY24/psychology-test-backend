import { Module } from '@nestjs/common';
import { MidtransClient } from './client/midtrans.client';
import { MidtransSnapProvider } from './gateway/midtrans-snap.provider';
import { StubSnapProvider } from './gateway/stub-snap.provider';

@Module({
  providers: [
    MidtransClient,
    MidtransSnapProvider,
    // `MIDTRANS_STUB=true` swaps the transport for a deterministic in-memory
    // provider, so every Snap flow (create, redirect, status) works offline.
    StubSnapProvider,
  ],
  exports: [MidtransClient, MidtransSnapProvider, StubSnapProvider],
})
export class MidtransModule {}
