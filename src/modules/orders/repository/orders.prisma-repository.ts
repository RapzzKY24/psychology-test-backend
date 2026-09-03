import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Order, Prisma } from '../../../generated/prisma/client';
import type { OrdersRepository } from './orders.repository';

@Injectable()
export class PrismaOrdersRepository implements OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Order | null> {
    return this.prisma.order.findUnique({ where: { id } });
  }

  findPendingOrPaidByAmount(
    amount: number,
    since: Date,
  ): Promise<Order | null> {
    return this.prisma.order.findFirst({
      where: {
        amount,
        status: { in: ['PENDING', 'PAID'] },
        createdAt: { gte: since },
      },
    });
  }

  create(data: Prisma.OrderCreateInput): Promise<Order> {
    return this.prisma.order.create({ data });
  }

  update(id: string, data: Prisma.OrderUpdateInput): Promise<Order> {
    return this.prisma.order.update({ where: { id }, data });
  }

  async updateManyToExpired(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.prisma.order.updateMany({
      where: { id: { in: ids }, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  }

  async findMany(params: {
    where: Prisma.OrderWhereInput;
    skip: number;
    take: number;
    orderBy?: Prisma.OrderOrderByWithRelationInput;
  }): Promise<{ data: Order[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy ?? { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where: params.where }),
    ]);
    return { data, total };
  }
}
