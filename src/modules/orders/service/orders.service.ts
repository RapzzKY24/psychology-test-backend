import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ORDERS_REPOSITORY } from '../repository/orders.repository';
import type {
  OrdersRepository,
  VerifyPaymentResult,
} from '../repository/orders.repository';
import type {
  Order,
  PaymentProvider,
  PaymentVerifiedBySource,
  Prisma,
} from '../../../generated/prisma/client';
import type { QueryPaymentsDto } from '../dto/query-payments.dto';
import type { AdminPaymentListItemDto } from '../dto/admin-payment-list-item.dto';
import { OrderPaymentService } from './order-payment.service';

export interface CreateOrderResult {
  orderId: string;
  basePrice: number;
  uniqueCode: number;
  amount: number;
  expiresAt: Date;
  qrisImageUrl: string | null;
  paymentProvider: PaymentProvider;
  vaNumber: string | null;
  vaBankCode: string | null;
  /** Hosted payment page (Snap). Null for VA and manual providers. */
  paymentUrl: string | null;
  /** Snap token for the embedded popup. Null for VA and manual providers. */
  paymentToken: string | null;
}

@Injectable()
export class OrdersService {
  constructor(
    @Inject(ORDERS_REPOSITORY)
    private readonly repo: OrdersRepository,
    private readonly configService: ConfigService,
    private readonly orderPayment: OrderPaymentService,
  ) {}

  private get paymentTtlMin(): number {
    return this.configService.get<number>('app.paymentTtlMin', 60);
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

  async create(testId: string, userId: string): Promise<CreateOrderResult> {
    const test = await this.repo.findTestById(testId);
    if (!test) throw new NotFoundException('Test not found');
    if (test.status !== 'PUBLISHED') {
      throw new UnprocessableEntityException({
        message: 'validation_failed',
        details: ['test must be PUBLISHED'],
      });
    }

    if (this.orderPayment.isEnabled()) {
      const order = await this.orderPayment.createPaymentOrder(
        testId,
        userId,
        test.price,
        test.name,
      );
      return {
        orderId: order.id,
        basePrice: order.basePrice,
        uniqueCode: order.uniqueCode,
        amount: order.amount,
        expiresAt: order.expiresAt,
        qrisImageUrl: null,
        paymentProvider: order.paymentProvider ?? 'MIDTRANS_SNAP',
        vaNumber: order.vaNumber,
        vaBankCode: order.vaBankCode,
        paymentUrl: order.paymentUrl ?? null,
        paymentToken: order.paymentToken ?? null,
      };
    }

    let order: Order;
    try {
      order = await this.repo.createWithUniqueCheck(
        test.price,
        testId,
        userId,
        this.paymentTtlMin,
      );
    } catch (error) {
      if ((error as Error)?.message === 'code_exhausted') {
        // Spec: "retry loop, max 5 attempts → 500 code_exhausted"
        throw new InternalServerErrorException('code_exhausted');
      }
      throw error;
    }

    const qrisImageUrl = await this.repo.getQrisImageUrl();
    return {
      orderId: order.id,
      basePrice: order.basePrice,
      uniqueCode: order.uniqueCode,
      amount: order.amount,
      expiresAt: order.expiresAt,
      qrisImageUrl,
      paymentProvider: 'MANUAL_QRIS',
      vaNumber: null,
      vaBankCode: null,
      paymentUrl: null,
      paymentToken: null,
    };
  }

  findOwnedByRef(
    ref: string,
    userId: string,
  ): Promise<{ order: Order; testName: string } | null> {
    return this.repo.findOwnedByRef(ref, userId);
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
    paymentUrl: string | null;
    paymentToken: string | null;
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
      paymentUrl: fresh.paymentUrl ?? null,
      paymentToken: fresh.paymentToken ?? null,
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
    const updatedCount = await this.repo.updateClaimIfUnset(
      order.id,
      new Date(),
    );
    if (updatedCount === 0) {
      const current = await this.repo.findById(orderId);
      return { id: orderId, userClaimedAt: current!.userClaimedAt as Date };
    }
    const updated = await this.repo.findById(orderId);
    return { id: updated!.id, userClaimedAt: updated!.userClaimedAt as Date };
  }

  async listPayments(
    query: QueryPaymentsDto,
  ): Promise<{ data: AdminPaymentListItemDto[]; total: number }> {
    await this.repo.expireStalePending();
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.amount !== undefined) where.amount = query.amount;
    const skip = (query.page - 1) * query.limit;
    const { data, total } = await this.repo.findManyEnriched({
      where,
      skip,
      take: query.limit,
    });
    return {
      data: data.map((order) => ({
        orderId: order.id,
        userName: order.user.name,
        userEmail: order.user.email,
        testName: order.test.name,
        amount: order.amount,
        uniqueCode: order.uniqueCode,
        createdAt: order.createdAt.toISOString(),
        expiresAt: order.expiresAt.toISOString(),
        claimed: order.userClaimedAt !== null,
        status: order.status,
        verifiedBy: order.verifiedBy,
      })),
      total,
    };
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

    const result = await this.repo.verifyPayment(orderId, adminId);
    if (result.outcome === 'not_found') {
      throw new NotFoundException('Order not found');
    }
    if (result.outcome === 'conflict') {
      throw new ConflictException(result.reason);
    }

    return {
      orderId,
      status: 'PAID',
      wasLate: result.wasLate,
      sessionId: result.sessionId,
      attemptId: result.attemptId,
    };
  }

  /** Provider-agnostic lookup: the id Midtrans echoes back on every notification. */
  findByProviderOrderId(providerOrderId: string): Promise<Order | null> {
    return this.repo.findByProviderOrderId(providerOrderId);
  }

  /** Record the method the customer actually paid with (best effort). */
  async updatePaymentType(orderId: string, paymentType: string): Promise<void> {
    await this.repo.update(orderId, { paymentType });
  }

  /** Gateway-sourced unlock; the repository re-checks status transactionally (exactly-once). */
  confirmExternalPayment(
    orderId: string,
    source: PaymentVerifiedBySource,
  ): Promise<VerifyPaymentResult> {
    return this.repo.confirmExternalPayment(orderId, source);
  }

  findUnsettledOrders(params: {
    provider: PaymentProvider;
    dueBefore: Date;
    notBefore: Date;
    limit: number;
  }): Promise<Order[]> {
    return this.repo.findUnsettledOrders(params);
  }

  findPendingOrdersWithoutProviderOrderId(params: {
    provider: PaymentProvider;
    createdBefore: Date;
    limit: number;
  }): Promise<Order[]> {
    return this.repo.findPendingOrdersWithoutProviderOrderId(params);
  }

  /** Retry payment creation for an order that has no provider order yet. */
  reprovision(orderId: string): Promise<Order | null> {
    return this.orderPayment.reprovision(orderId);
  }

  async cancel(
    orderId: string,
    reason: string,
  ): Promise<{ orderId: string; status: string }> {
    const order = await this.repo.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'PAID')
      throw new ConflictException('already_verified');
    if (order.status === 'CANCELLED')
      throw new ConflictException('order_cancelled');
    if (order.status !== 'PENDING' && order.status !== 'EXPIRED') {
      throw new ConflictException('order_cancelled');
    }
    const updated = await this.repo.cancelPayment(orderId, reason);
    if (updated === 0) {
      const current = await this.repo.findById(orderId);
      if (!current) throw new NotFoundException('Order not found');
      if (current.status === 'PAID')
        throw new ConflictException('already_verified');
      throw new ConflictException('order_cancelled');
    }
    return { orderId, status: 'CANCELLED' };
  }
}
