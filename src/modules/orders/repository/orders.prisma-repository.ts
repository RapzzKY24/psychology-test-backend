import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { isUuid } from '../../../common/utils/is-uuid';
import type {
  Order,
  OrderStatus,
  PaymentProvider,
  PaymentVerifiedBySource,
  Prisma,
  Test,
} from '../../../generated/prisma/client';
import type {
  OrdersRepository,
  VerifyPaymentResult,
} from './orders.repository';
import type { CreatePaymentCustomer } from '../../payments/gateway/payment-gateway.interface';
import { randomInt } from 'crypto';
import { generateInviteToken } from '../../sessions/utils/generate-invite-token';

@Injectable()
export class PrismaOrdersRepository implements OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Order | null> {
    return this.prisma.order.findUnique({ where: { id } });
  }

  async findUserContact(userId: string): Promise<CreatePaymentCustomer | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    return user ? { name: user.name, email: user.email } : null;
  }

  async findOwnedByRef(
    ref: string,
    userId: string,
  ): Promise<{ order: Order; testName: string } | null> {
    const byRef: Prisma.OrderWhereInput[] = [{ providerOrderId: ref }];
    if (isUuid(ref)) byRef.unshift({ id: ref });

    const row = await this.prisma.order.findFirst({
      where: { OR: byRef, userId },
      include: { test: { select: { name: true } } },
    });
    if (!row) return null;

    const { test, ...order } = row;
    return { order, testName: test.name };
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
                basePrice,
                uniqueCode,
                amount,
                status: 'PENDING',
                expiresAt: new Date(Date.now() + ttlMin * 60 * 1000),
                test: { connect: { id: testId } },
              },
            });
          },
          { isolationLevel: 'Serializable' },
        );
        return order;
      } catch (error) {
        const msg = (error as Error)?.message;
        if (msg === 'collision') continue;
        const code = (error as { code?: string })?.code;
        if (code === 'P2002' || code === 'P2034' || code === '40001') continue;
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

  async updateClaimIfUnset(id: string, claimedAt: Date): Promise<number> {
    const result = await this.prisma.order.updateMany({
      where: { id, userClaimedAt: null },
      data: { userClaimedAt: claimedAt },
    });
    return result.count;
  }

  async cancelPayment(id: string, reason: string): Promise<number> {
    const result = await this.prisma.order.updateMany({
      where: { id, status: { in: ['PENDING', 'EXPIRED'] } },
      data: { status: 'CANCELLED', cancelReason: reason },
    });
    return result.count;
  }

  findByVaNumber(vaNumber: string): Promise<Order | null> {
    return this.prisma.order.findFirst({ where: { vaNumber } });
  }

  /**
   * `providerOrderId` is the only key the gateway echoes back on a
   * notification, so this is the lookup used by the notification handler.
   */
  findByProviderOrderId(providerOrderId: string): Promise<Order | null> {
    return this.prisma.order.findUnique({ where: { providerOrderId } });
  }

  verifyPayment(
    orderId: string,
    adminId: string,
  ): Promise<VerifyPaymentResult> {
    return this.settleOrder(orderId, {
      verifiedById: adminId,
      verifiedBySource: 'ADMIN',
    });
  }

  confirmExternalPayment(
    orderId: string,
    source: PaymentVerifiedBySource,
  ): Promise<VerifyPaymentResult> {
    return this.settleOrder(orderId, {
      verifiedById: null,
      verifiedBySource: source,
    });
  }

  findUnsettledOrders(params: {
    provider: PaymentProvider;
    dueBefore: Date;
    notBefore: Date;
    limit: number;
  }): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: {
        status: { in: ['PENDING', 'EXPIRED'] },
        paymentProvider: params.provider,
        providerOrderId: { not: null },
        expiresAt: { lte: params.dueBefore, gte: params.notBefore },
      },
      orderBy: { expiresAt: 'asc' },
      take: params.limit,
    });
  }

  findPendingOrdersWithoutProviderOrderId(params: {
    provider: PaymentProvider;
    createdBefore: Date;
    limit: number;
  }): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: {
        status: 'PENDING',
        paymentProvider: params.provider,
        providerOrderId: null,
        createdAt: { lt: params.createdBefore },
      },
      orderBy: { createdAt: 'asc' },
      take: params.limit,
    });
  }

  private async settleOrder(
    orderId: string,
    attrs: {
      verifiedById: string | null;
      verifiedBySource: PaymentVerifiedBySource;
    },
  ): Promise<VerifyPaymentResult> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({ where: { id: orderId } });
      if (!current) return { outcome: 'not_found' };
      if (current.status === 'PAID')
        return { outcome: 'conflict', reason: 'already_verified' };
      if (current.status === 'CANCELLED')
        return { outcome: 'conflict', reason: 'order_cancelled' };
      if (current.status !== 'PENDING' && current.status !== 'EXPIRED') {
        return { outcome: 'conflict', reason: 'already_verified' };
      }
      const wasLate =
        current.status === 'EXPIRED' ||
        current.expiresAt.getTime() <= Date.now();
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: { in: ['PENDING', 'EXPIRED'] } },
        data: {
          status: 'PAID',
          verifiedById: attrs.verifiedById,
          verifiedBySource: attrs.verifiedBySource,
          verifiedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        return { outcome: 'conflict', reason: 'already_verified' };
      }
      const session = await tx.testSession.create({
        data: {
          kind: 'INDIVIDUAL',
          title: `Order ${orderId}`,
          token: generateInviteToken(),
          slotLimit: 1,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
        },
      });
      const attempt = await tx.attempt.create({
        data: {
          sessionId: session.id,
          testId: current.testId,
          userId: current.userId,
          status: 'IN_PROGRESS',
        },
      });
      return {
        outcome: 'verified',
        wasLate,
        sessionId: session.id,
        attemptId: attempt.id,
      };
    });
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
      verifiedBy: { id: string; name: string; email: string } | null;
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
    // Fetch owner users in bulk
    const userIds = [...new Set(data.map((o) => o.userId))];
    const verifierIds = [
      ...new Set(
        data.map((o) => o.verifiedById).filter((id): id is string => !!id),
      ),
    ];
    const users: { id: string; name: string; email: string }[] = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const verifiers: { id: string; name: string; email: string }[] =
      verifierIds.length
        ? await this.prisma.user.findMany({
            where: { id: { in: verifierIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
    const userMap = new Map<string, { name: string; email: string }>(
      users.map((u) => [u.id, u]),
    );
    const verifierMap = new Map<
      string,
      { id: string; name: string; email: string }
    >(verifiers.map((u) => [u.id, u]));
    const enriched = data.map((o) => ({
      ...o,
      user: userMap.get(o.userId) ?? {
        name: 'Unknown',
        email: '',
      },
      test: (o as unknown as { test: { name: string } }).test,
      verifiedBy: o.verifiedById
        ? (verifierMap.get(o.verifiedById) ?? null)
        : null,
    }));
    return { data: enriched, total };
  }

  async listByUser(params: {
    userId: string;
    skip: number;
    take: number;
    status?: OrderStatus;
  }): Promise<{ data: (Order & { test: { name: string } })[]; total: number }> {
    const where: Prisma.OrderWhereInput = { userId: params.userId };
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: { test: { select: { name: true } } },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { data, total };
  }
}
