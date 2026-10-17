import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoicesController } from './controller/invoices.controller';
import { InvoicesService } from './service/invoices.service';
import { InvoiceVaService } from './service/invoice-va.service';
import { PrismaInvoicesRepository } from './repository/invoices.prisma-repository';
import { INVOICES_REPOSITORY } from './repository/invoices.repository';
import { GdcModule } from '../gdc/gdc.module';
import { GdcClient } from '../gdc/client/gdc.client';
import { EventLogModule } from '../event-log/event-log.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { PAYMENT_GATEWAY } from './gateway/payment-gateway.interface';
import { GdcVaProvider } from './gateway/gdc-va.provider';
import { StubVaProvider } from './gateway/stub-va.provider';

@Module({
  imports: [GdcModule, EventLogModule, IdempotencyModule],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    InvoiceVaService,
    { provide: INVOICES_REPOSITORY, useClass: PrismaInvoicesRepository },
    {
      provide: PAYMENT_GATEWAY,
      useFactory: (config: ConfigService, gdc: GdcClient) =>
        config.get<boolean>('app.gdcStub')
          ? new StubVaProvider()
          : new GdcVaProvider(gdc, config),
      inject: [ConfigService, GdcClient],
    },
  ],
  exports: [InvoicesService, InvoiceVaService],
})
export class InvoicesModule {}
