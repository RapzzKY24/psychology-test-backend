import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  Inject,
} from '@nestjs/common';
import { ORDERS_REPOSITORY } from '../repository/orders.repository';
import type { OrdersRepository } from '../repository/orders.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { generateUniqueCode } from '../utils/generate-unique-code';
import { calcTotal } from '../utils/calc-total';
import { generateInviteToken } from '../../sessions/utils/generate-invite-token';
import type { Order } from '../../../generated/prisma/client';
import type { QueryPaymentsDto } from '../dto/query-payments.dto';

const PAYMENT_TTL_MIN = parseInt(process.env.PAYMENT_TTL_MIN ?? '60', 10);
const COLLISION_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

@Injectable()
export class OrdersService {
  constructor(
    @Inject(ORDERS_REPOSITORY)
    private readonly repo: OrdersRepository,
    private readonly prisma: PrismaService,
  ) {}

  private async getQrisImageUrl(): Promise<string | null> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: 'payment.qrisImagePath' },
    });
    if (!setting?.value) return null;
    const p = (setting.value as { path?: string })?.path;
    if (!p) return null;
    return '/api/v1/public/payments/qris-image';
  }

  private isExpired(order: Order): boolean {
    return (
      order.status === 'PENDING' && order.expiresAt.getTime() <= Date.now()
    );
  }

  private async lazyExpire(order: Order): Promise<Order> {
    if (!this.isExpired(order)) return order;
    try {
      const updated = await this.repo.update(order.id, { status: 'EXPIRED' });
      return updated;
    } catch {
      return { ...order, status: 'EXPIRED' as const };
    }
  }

  async create(
    testId: string,
    userId: string,
  ): Promise<{
    orderId: string;
    basePrice: number;
    uniqueCode: number;
    amount: number;
    expiresAt: Date;
    qrisImageUrl: string | null;
  }> {
    const test = await this.prisma.test.findUnique({ where: { id: testId } });
    if (!test) throw new NotFoundException('Test not found');
    if (test.status !== 'PUBLISHED') {
      throw new UnprocessableEntityException({
        message: 'validation_failed',
        details: ['test must be PUBLISHED'],
      });
    }

    const basePrice = test.price;
    const since = new Date(Date.now() - COLLISION_WINDOW_MS);
    let uniqueCode = 0;
    let amount = 0;
    let attempts = 0;
    for (; attempts < MAX_CODE_ATTEMPTS; attempts++) {
      uniqueCode = generateUniqueCode();
      amount = calcTotal(basePrice, uniqueCode);
      const collision = await this.repo.findPendingOrPaidByAmount(
        amount,
        since,
      );
      if (!collision) break;
      if (attempts === MAX_CODE_ATTEMPTS - 1) {
        throw new UnprocessableEntityException({
          message: 'validation_failed',
          details: ['code_exhausted'],
        });
      }
    }

    const expiresAt = new Date(Date.now() + PAYMENT_TTL_MIN * 60 * 1000);
    const order = await this.repo.create({
      userId,
      test: { connect: { id: testId } },
      basePrice,
      uniqueCode,
      amount,
      status: 'PENDING',
      expiresAt,
    } as never);

    const qrisImageUrl = await this.getQrisImageUrl();
    return {
      orderId: order.id,
      basePrice: order.basePrice,
      uniqueCode: order.uniqueCode,
      amount: order.amount,
      expiresAt: order.expiresAt,
      qrisImageUrl,
    };
  }

  async findById(
    orderId: string,
    userId: string,
  ): Promise<{
    id: string;
    status: string;
    amount: number;
    basePrice: number;
    uniqueCode: number;
    expiresAt: Date;
    secondsRemaining: number | null;
    userClaimedAt: Date | null;
  }> {
    const order = await this.repo.findById(orderId);
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }
    const fresh = await this.lazyExpire(order);
    const secondsRemaining =
      fresh.status === 'PENDING'
        ? Math.max(
            0,
            Math.floor((fresh.expiresAt.getTime() - Date.now()) / 1000),
          )
        : null;
    return {
      id: fresh.id,
      status: fresh.status,
      amount: fresh.amount,
      basePrice: fresh.basePrice,
      uniqueCode: fresh.uniqueCode,
      expiresAt: fresh.expiresAt,
      secondsRemaining,
      userClaimedAt: fresh.userClaimedAt ?? null,
    };
  }

  async claim(
    orderId: string,
    userId: string,
  ): Promise<{ id: string; userClaimedAt: Date }> {
    const order = await this.repo.findById(orderId);
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }
    if (order.userClaimedAt) {
      return { id: order.id, userClaimedAt: order.userClaimedAt };
    }
    const updated = await this.repo.update(order.id, {
      userClaimedAt: new Date(),
    });
    return { id: updated.id, userClaimedAt: updated.userClaimedAt as Date };
  }

  async listPayments(
    query: QueryPaymentsDto,
  ): Promise<{ data: Order[]; total: number }> {
    // Lazy expire stale PENDING before list
    await this.prisma.order.updateMany({
      where: { status: 'PENDING', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.amount !== undefined) where.amount = query.amount;
    const skip = (query.page - 1) * query.limit;
    const { data, total } = await this.repo.findMany({
      where: where,
      skip,
      take: query.limit,
    });
    // Enrich with user/test for admin screen — fetch in bulk
    return { data, total };
  }

  async verify(
    orderId: string,
    adminId: string,
  ): Promise<{
    orderId: string;
    status: string;
    wasLate: boolean;
    sessionId: string;
    attemptId: string;
  }> {
    const order = await this.repo.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'PAID')
      throw new ConflictException('already_verified');
    if (order.status === 'CANCELLED')
      throw new ConflictException('order_cancelled');
    if (order.status !== 'PENDING' && order.status !== 'EXPIRED') {
      throw new ConflictException('already_verified');
    }
    const wasLate = order.status === 'EXPIRED';

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: { in: ['PENDING', 'EXPIRED'] } },
        data: { status: 'PAID', verifiedById: adminId, verifiedAt: new Date() },
      });
      if (updated.count === 0) {
        const current = await tx.order.findUnique({ where: { id: orderId } });
        if (!current) throw new NotFoundException('Order not found');
        if (current.status === 'PAID')
          throw new ConflictException('already_verified');
        if (current.status === 'CANCELLED')
          throw new ConflictException('order_cancelled');
        throw new ConflictException('already_verified');
      }

      // Create INDIVIDUAL session + attempt — exactly once
      const token = generateInviteToken();
      const session = await tx.testSession.create({
        data: {
          kind: 'INDIVIDUAL',
          title: `Order ${orderId}`,
          token,
          slotLimit: 1,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
        },
      });
      const attempt = await tx.attempt.create({
        data: {
          sessionId: session.id,
          testId: order.testId,
          userId: order.userId,
          status: 'IN_PROGRESS',
        },
      });
      return { sessionId: session.id, attemptId: attempt.id };
    });

    return {
      orderId,
      status: 'PAID',
      wasLate,
      sessionId: result.sessionId,
      attemptId: result.attemptId,
    };
  }

  async cancel(
    orderId: string,
    _reason: string,
  ): Promise<{ orderId: string; status: string }> {
    void _reason;
    const order = await this.repo.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'PAID')
      throw new ConflictException('already_verified');
    if (order.status === 'CANCELLED')
      throw new ConflictException('order_cancelled');
    if (order.status !== 'PENDING' && order.status !== 'EXPIRED') {
      throw new ConflictException('order_cancelled');
    }
    const updated = await this.prisma.order.updateMany({
      where: { id: orderId, status: { in: ['PENDING', 'EXPIRED'] } },
      data: { status: 'CANCELLED' },
    });
    if (updated.count === 0) {
      const current = await this.repo.findById(orderId);
      if (!current) throw new NotFoundException('Order not found');
      if (current.status === 'PAID')
        throw new ConflictException('already_verified');
      throw new ConflictException('order_cancelled');
    }
    return { orderId, status: 'CANCELLED' };
  }
}
