import { Module } from '@nestjs/common';
import { DokuClient } from './client/doku.client';

/** Transport only: no settlement logic lives here. */
@Module({
  providers: [DokuClient],
  exports: [DokuClient],
})
export class DokuModule {}
