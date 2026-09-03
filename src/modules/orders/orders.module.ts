import { Module } from '@nestjs/common';
import { OrdersController } from './controller/orders.controller';
import { AdminPaymentsController } from './controller/admin-payments.controller';
import { QrisController } from './controller/qris.controller';
import { OrdersService } from './service/orders.service';
import { QrisService } from './service/qris.service';
import { PrismaOrdersRepository } from './repository/orders.prisma-repository';
import { ORDERS_REPOSITORY } from './repository/orders.repository';

@Module({
  controllers: [OrdersController, AdminPaymentsController, QrisController],
  providers: [
    OrdersService,
    QrisService,
    { provide: ORDERS_REPOSITORY, useClass: PrismaOrdersRepository },
  ],
})
export class OrdersModule {}
