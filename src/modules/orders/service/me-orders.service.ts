import { Inject, Injectable } from '@nestjs/common';
import { ORDERS_REPOSITORY } from '../repository/orders.repository';
import type { OrdersRepository } from '../repository/orders.repository';
import type { MeOrderItemDto, QueryMeOrdersDto } from '../dto/me-order.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';

/**
 * A buyer's own purchase history (participant dashboard, "Pembelian" tab).
 *
 * Only orders with a `userId` appear here: an institution buys through invoices,
 * so the two paths never mix. The query is scoped by the session user, never by
 * an id from the client.
 */
@Injectable()
export class MeOrdersService {
  constructor(
    @Inject(ORDERS_REPOSITORY)
    private readonly repo: OrdersRepository,
  ) {}

  async list(
    userId: string,
    query: QueryMeOrdersDto,
  ): Promise<PaginatedResponse<MeOrderItemDto>> {
    // Same lazy expiry the admin screen runs: a buyer must never read
    // "Menunggu bayar" on an order whose payment window already closed.
    await this.repo.expireStalePending();

    const { data, total } = await this.repo.listByUser({
      userId,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      status: query.status,
    });

    const now = Date.now();
    return {
      data: data.map((order) => {
        // `expiresAt` is checked as well as the status: the expiry pass above
        // is a bulk update, and a row created between the two statements would
        // otherwise read as payable for one more request.
        const canPay =
          order.status === 'PENDING' && order.expiresAt.getTime() > now;
        return {
          id: order.id,
          testName: order.test.name,
          amount: order.amount,
          status: order.status,
          createdAt: order.createdAt,
          expiresAt: order.expiresAt,
          paidAt: order.verifiedAt ?? null,
          canPay,
          // A manual-QRIS order has no hosted page; the dialog renders the
          // merchant QR from settings instead, so null is not "cannot pay".
          paymentUrl: canPay ? (order.paymentUrl ?? null) : null,
        };
      }),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
