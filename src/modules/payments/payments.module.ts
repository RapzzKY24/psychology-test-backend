import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { EventLogModule } from '../event-log/event-log.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { GdcModule } from '../gdc/gdc.module';
import { GdcWebhookController } from './controller/gdc-webhook.controller';
import { PaymentsService } from './service/payments.service';
import { PaymentsRecoveryService } from './service/payments-recovery.service';

@Module({
  imports: [
    OrdersModule,
    InvoicesModule,
    EventLogModule,
    IdempotencyModule,
    GdcModule,
  ],
  controllers: [GdcWebhookController],
  providers: [PaymentsService, PaymentsRecoveryService],
})
export class PaymentsModule {}
