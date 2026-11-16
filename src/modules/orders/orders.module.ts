import { Module } from '@nestjs/common';
import { OrdersController } from './controller/orders.controller';
import { MeOrdersController } from './controller/me-orders.controller';
import { AdminPaymentsController } from './controller/admin-payments.controller';
import { AdminQrisController } from './controller/qris.controller';
import { PublicQrisController } from './controller/qris.controller';
import { OrdersService } from './service/orders.service';
import { MeOrdersService } from './service/me-orders.service';
import { OrderPaymentService } from './service/order-payment.service';
import { QrisService } from './service/qris.service';
import { PaymentGatewayModule } from '../payments/gateway/payment-gateway.module';
import { EventLogModule } from '../event-log/event-log.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { PrismaOrdersRepository } from './repository/orders.prisma-repository';
import { PrismaQrisRepository } from './repository/qris.prisma-repository';
import { ORDERS_REPOSITORY } from './repository/orders.repository';
import { QRIS_REPOSITORY } from './repository/qris.repository';

@Module({
  imports: [PaymentGatewayModule, EventLogModule, IdempotencyModule],
  controllers: [
    OrdersController,
    MeOrdersController,
    AdminPaymentsController,
    AdminQrisController,
    PublicQrisController,
  ],
  providers: [
    OrdersService,
    MeOrdersService,
    OrderPaymentService,
    QrisService,
    { provide: ORDERS_REPOSITORY, useClass: PrismaOrdersRepository },
    { provide: QRIS_REPOSITORY, useClass: PrismaQrisRepository },
  ],
  exports: [OrdersService, OrderPaymentService],
})
export class OrdersModule {}
