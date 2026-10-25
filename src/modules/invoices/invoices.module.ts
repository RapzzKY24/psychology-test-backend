import { Module } from '@nestjs/common';
import { InvoicesController } from './controller/invoices.controller';
import { InvoicesService } from './service/invoices.service';
import { InvoiceVaService } from './service/invoice-va.service';
import { AdminInvoicesService } from './service/admin-invoices.service';
import { PrismaInvoicesRepository } from './repository/invoices.prisma-repository';
import { INVOICES_REPOSITORY } from './repository/invoices.repository';
import { JokulModule } from '../jokul/jokul.module';
import { EventLogModule } from '../event-log/event-log.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';

@Module({
  imports: [JokulModule, EventLogModule, IdempotencyModule],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    AdminInvoicesService,
    InvoiceVaService,
    { provide: INVOICES_REPOSITORY, useClass: PrismaInvoicesRepository },
  ],
  exports: [InvoicesService, InvoiceVaService],
})
export class InvoicesModule {}
