import { Module } from '@nestjs/common';
import { InvoicesController } from './controller/invoices.controller';
import { InvoicesService } from './service/invoices.service';
import { PrismaInvoicesRepository } from './repository/invoices.prisma-repository';
import { INVOICES_REPOSITORY } from './repository/invoices.repository';

@Module({
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    { provide: INVOICES_REPOSITORY, useClass: PrismaInvoicesRepository },
  ],
})
export class InvoicesModule {}
