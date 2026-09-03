import type { Order, Prisma, Test } from '../../../generated/prisma/client';

export const ORDERS_REPOSITORY = 'OrdersRepository';

export interface OrdersRepository {
  findById(id: string): Promise<Order | null>;
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
    })[];
    total: number;
  }>;
}
