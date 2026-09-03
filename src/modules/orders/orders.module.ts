import { Module } from '@nestjs/common';
import { OrdersController } from './controller/orders.controller';
import { OrdersService } from './service/orders.service';
import { PrismaOrdersRepository } from './repository/orders.prisma-repository';
import { ORDERS_REPOSITORY } from './repository/orders.repository';

@Module({
  controllers: [OrdersController],
  providers: [
    OrdersService,
    { provide: ORDERS_REPOSITORY, useClass: PrismaOrdersRepository },
  ],
})
export class OrdersModule {}
