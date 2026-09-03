import {
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
import type { Order } from '../../../generated/prisma/client';

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
    if (!setting || !setting.value) return null;
    const value = setting.value as { path?: string; url?: string };
    return value.path ?? value.url ?? null;
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
}
