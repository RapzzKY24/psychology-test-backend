import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Order, Prisma, Test } from '../../../generated/prisma/client';
import type { OrdersRepository } from './orders.repository';
import { randomInt } from 'crypto';

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

  findTestById(id: string): Promise<Test | null> {
    return this.prisma.test.findUnique({ where: { id } });
  }

  async getQrisImageUrl(): Promise<string | null> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: 'payment.qrisImagePath' },
    });
    if (!setting?.value) return null;
    const p = (setting.value as { path?: string })?.path;
    if (!p) return null;
    return '/api/v1/public/payments/qris-image';
  }

  async expireStalePending(): Promise<number> {
    const result = await this.prisma.order.updateMany({
      where: { status: 'PENDING', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  }

  async createWithUniqueCheck(
    basePrice: number,
    testId: string,
    userId: string,
    ttlMin: number,
  ): Promise<Order> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    for (let attempt = 0; attempt < 5; attempt++) {
      const uniqueCode = randomInt(1, 1000);
      const amount = basePrice + uniqueCode;
      // Transactional check-then-insert with serializable isolation
      try {
        const order = await this.prisma.$transaction(
          async (tx) => {
            const collision = await tx.order.findFirst({
              where: {
                amount,
                status: { in: ['PENDING', 'PAID'] },
                createdAt: { gte: since },
              },
            });
            if (collision) throw new Error('collision');
            return tx.order.create({
              data: {
                userId,
                testId,
                basePrice,
                uniqueCode,
                amount,
                status: 'PENDING',
                expiresAt: new Date(Date.now() + ttlMin * 60 * 1000),
                test: { connect: { id: testId } },
              } as never,
            });
          },
          { isolationLevel: 'Serializable' } as never,
        );
        return order;
      } catch (error) {
        const msg = (error as Error)?.message;
        if (msg === 'collision') continue;
        const code = (error as { code?: string })?.code;
        if (code === 'P2002') continue;
        throw error;
      }
    }
    throw new Error('code_exhausted');
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

  async findManyEnriched(params: {
    where: Prisma.OrderWhereInput;
    skip: number;
    take: number;
    orderBy?: Prisma.OrderOrderByWithRelationInput;
  }): Promise<{
    data: (Order & {
      user: { name: string; email: string };
      test: { name: string };
    })[];
    total: number;
  }> {
    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy ?? { createdAt: 'desc' },
        include: { test: { select: { name: true } } },
      }),
      this.prisma.order.count({ where: params.where }),
    ]);
    // Fetch users in bulk
    const userIds = [...new Set(data.map((o) => o.userId))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    const enriched = data.map((o) => ({
      ...o,
      user: (userMap.get(o.userId) as { name: string; email: string }) ?? {
        name: 'Unknown',
        email: '',
      },
      test: (o as unknown as { test: { name: string } }).test,
    }));
    return { data: enriched, total };
  }
}
