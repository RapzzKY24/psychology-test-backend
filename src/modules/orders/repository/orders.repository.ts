import type { Order, Prisma } from '../../../generated/prisma/client';

export const ORDERS_REPOSITORY = 'OrdersRepository';

export interface OrdersRepository {
  findById(id: string): Promise<Order | null>;
  findPendingOrPaidByAmount(amount: number, since: Date): Promise<Order | null>;
  create(data: Prisma.OrderCreateInput): Promise<Order>;
  update(id: string, data: Prisma.OrderUpdateInput): Promise<Order>;
  updateManyToExpired(ids: string[]): Promise<number>;
  findMany(params: {
    where: Prisma.OrderWhereInput;
    skip: number;
    take: number;
    orderBy?: Prisma.OrderOrderByWithRelationInput;
  }): Promise<{ data: Order[]; total: number }>;
}
