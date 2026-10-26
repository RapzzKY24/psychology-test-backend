import type {
  Order,
  PaymentProvider,
  PaymentVerifiedBySource,
  Prisma,
  Test,
} from '../../../generated/prisma/client';

export const ORDERS_REPOSITORY = 'OrdersRepository';

export type VerifyPaymentResult =
  | { outcome: 'not_found' }
  | { outcome: 'conflict'; reason: 'already_verified' | 'order_cancelled' }
  | {
      outcome: 'verified';
      wasLate: boolean;
      sessionId: string;
      attemptId: string;
    };

export interface OrdersRepository {
  findById(id: string): Promise<Order | null>;
  /**
   * Order resolved by its own id or by `providerOrderId`, restricted to the
   * owner. Also returns the test name for the checkout result page.
   */
  findOwnedByRef(
    ref: string,
    userId: string,
  ): Promise<{ order: Order; testName: string } | null>;
  findPendingOrPaidByAmount(amount: number, since: Date): Promise<Order | null>;
  findTestById(id: string): Promise<Test | null>;
  getQrisImageUrl(): Promise<string | null>;
  expireStalePending(): Promise<number>;
  create(data: Prisma.OrderCreateInput): Promise<Order>;
  createWithUniqueCheck(
    basePrice: number,
    testId: string,
    userId: string,
    ttlMin: number,
  ): Promise<Order>;
  update(id: string, data: Prisma.OrderUpdateInput): Promise<Order>;
  /** Set userClaimedAt only when it is still null — returns affected row count (0 = already claimed). */
  updateClaimIfUnset(id: string, claimedAt: Date): Promise<number>;
  /** Cancel a PENDING/EXPIRED order, recording the audit reason. Returns affected row count (0 = raced). */
  cancelPayment(id: string, reason: string): Promise<number>;
  /** Transactional exactly-once verify: PAID + verifiedBy + INDIVIDUAL session + attempt. */
  verifyPayment(orderId: string, adminId: string): Promise<VerifyPaymentResult>;
  /**
   * `providerOrderId` is the only key the gateway echoes back on a
   * notification, so this is the lookup used by the notification handler.
   */
  findByProviderOrderId(providerOrderId: string): Promise<Order | null>;
  /** Same exactly-once unlock as `verifyPayment`, but sourced from the gateway (verifiedBySource = DOKU). */
  /** Gateway-sourced unlock; `source` is the provider that reported the payment. */
  confirmExternalPayment(
    orderId: string,
    source: PaymentVerifiedBySource,
  ): Promise<VerifyPaymentResult>;
  /**
   * Unsettled orders of `provider` whose `expiresAt` fell in
   * `[notBefore, dueBefore]` — candidates for gateway status reconciliation.
   */
  findUnsettledOrders(params: {
    provider: PaymentProvider;
    dueBefore: Date;
    notBefore: Date;
    limit: number;
  }): Promise<Order[]>;
  /** `provider` orders still PENDING without a provider order id — retry provisioning. */
  findPendingOrdersWithoutProviderOrderId(params: {
    provider: PaymentProvider;
    createdBefore: Date;
    limit: number;
  }): Promise<Order[]>;
  updateManyToExpired(ids: string[]): Promise<number>;
  findMany(params: {
    where: Prisma.OrderWhereInput;
    skip: number;
    take: number;
    orderBy?: Prisma.OrderOrderByWithRelationInput;
  }): Promise<{ data: Order[]; total: number }>;
  findManyEnriched(params: {
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
  }>;
}
