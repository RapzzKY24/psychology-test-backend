import { Module } from '@nestjs/common';
import { OrdersController } from './controller/orders.controller';
import { AdminPaymentsController } from './controller/admin-payments.controller';
import { AdminQrisController } from './controller/qris.controller';
import { PublicQrisController } from './controller/qris.controller';
import { OrdersService } from './service/orders.service';
import { OrderVaService } from './service/order-va.service';
import { QrisService } from './service/qris.service';
import { JokulModule } from '../jokul/jokul.module';
import { EventLogModule } from '../event-log/event-log.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { PrismaOrdersRepository } from './repository/orders.prisma-repository';
import { PrismaQrisRepository } from './repository/qris.prisma-repository';
import { ORDERS_REPOSITORY } from './repository/orders.repository';
import { QRIS_REPOSITORY } from './repository/qris.repository';

@Module({
  imports: [JokulModule, EventLogModule, IdempotencyModule],
  controllers: [
    OrdersController,
    AdminPaymentsController,
    AdminQrisController,
    PublicQrisController,
  ],
  providers: [
    OrdersService,
    OrderVaService,
    QrisService,
    { provide: ORDERS_REPOSITORY, useClass: PrismaOrdersRepository },
    { provide: QRIS_REPOSITORY, useClass: PrismaQrisRepository },
  ],
  exports: [OrdersService, OrderVaService],
})
export class OrdersModule {}
