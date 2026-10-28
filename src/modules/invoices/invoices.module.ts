import { Module } from '@nestjs/common';
import { InvoicesController } from './controller/invoices.controller';
import { PublicInvoicesController } from './controller/public-invoices.controller';
import { InvoicesService } from './service/invoices.service';
import { InvoicePaymentService } from './service/invoice-payment.service';
import { AdminInvoicesService } from './service/admin-invoices.service';
import { InvoicePdfService } from './service/invoice-pdf.service';
import { PrismaInvoicesRepository } from './repository/invoices.prisma-repository';
import { INVOICES_REPOSITORY } from './repository/invoices.repository';
import { PaymentGatewayModule } from '../payments/gateway/payment-gateway.module';
import { EventLogModule } from '../event-log/event-log.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';

@Module({
  imports: [PaymentGatewayModule, EventLogModule, IdempotencyModule],
  controllers: [InvoicesController, PublicInvoicesController],
  providers: [
    InvoicesService,
    AdminInvoicesService,
    InvoicePdfService,
    InvoicePaymentService,
    { provide: INVOICES_REPOSITORY, useClass: PrismaInvoicesRepository },
  ],
  exports: [InvoicesService, InvoicePaymentService, InvoicePdfService],
})
export class InvoicesModule {}
