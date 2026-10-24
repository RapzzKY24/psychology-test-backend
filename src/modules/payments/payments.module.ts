import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { EventLogModule } from '../event-log/event-log.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { DokuModule } from '../doku/doku.module';
import { DokuWebhookController } from './controller/doku-webhook.controller';
import { PaymentsService } from './service/payments.service';
import { PaymentsRecoveryService } from './service/payments-recovery.service';

@Module({
  imports: [
    OrdersModule,
    InvoicesModule,
    EventLogModule,
    IdempotencyModule,
    DokuModule,
  ],
  controllers: [DokuWebhookController],
  providers: [PaymentsService, PaymentsRecoveryService],
})
export class PaymentsModule {}
