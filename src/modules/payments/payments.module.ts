import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { EventLogModule } from '../event-log/event-log.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { MidtransWebhookController } from './controller/midtrans-webhook.controller';
import { CheckoutStatusController } from './controller/checkout-status.controller';
import { PaymentsService } from './service/payments.service';
import { PaymentsRecoveryService } from './service/payments-recovery.service';
import { CheckoutStatusService } from './service/checkout-status.service';

@Module({
  imports: [OrdersModule, InvoicesModule, EventLogModule, IdempotencyModule],
  controllers: [MidtransWebhookController, CheckoutStatusController],
  providers: [PaymentsService, PaymentsRecoveryService, CheckoutStatusService],
})
export class PaymentsModule {}
