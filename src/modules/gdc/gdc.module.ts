import { Module } from '@nestjs/common';
import { GdcClient } from './client/gdc.client';

@Module({
  providers: [GdcClient],
  exports: [GdcClient],
})
export class GdcModule {}
