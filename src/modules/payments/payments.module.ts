import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { EventLogModule } from '../event-log/event-log.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { JokulWebhookController } from './controller/jokul-webhook.controller';
import { PaymentsService } from './service/payments.service';
import { PaymentsRecoveryService } from './service/payments-recovery.service';

@Module({
  imports: [OrdersModule, InvoicesModule, EventLogModule, IdempotencyModule],
  controllers: [JokulWebhookController],
  providers: [PaymentsService, PaymentsRecoveryService],
})
export class PaymentsModule {}
