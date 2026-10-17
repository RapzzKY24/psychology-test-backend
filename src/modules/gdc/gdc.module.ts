import { Module } from '@nestjs/common';
import { GdcClient } from './client/gdc.client';
import { GdcTokenProvider } from './client/gdc-token.provider';

@Module({
  providers: [GdcTokenProvider, GdcClient],
  exports: [GdcClient],
})
export class GdcModule {}
