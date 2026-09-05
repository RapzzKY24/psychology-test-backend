import { Controller, Get, Param, Post, Body, Query } from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { Session } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { QueryPaymentsSchema } from '../dto/query-payments.dto';
import type { QueryPaymentsDto } from '../dto/query-payments.dto';
import { CancelPaymentSchema } from '../dto/cancel-payment.dto';
import type { CancelPaymentDto } from '../dto/cancel-payment.dto';
import type { AdminPaymentListItemDto } from '../dto/admin-payment-list-item.dto';
import { OrdersService } from '../service/orders.service';
import type {
  ApiResponse,
  PaginatedResponse,
} from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/admin/payments')
export class AdminPaymentsController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @Roles(['ADMIN'])
  async list(
    @Query(new ZodValidationPipe(QueryPaymentsSchema)) query: QueryPaymentsDto,
  ): Promise<PaginatedResponse<AdminPaymentListItemDto>> {
    const { data, total } = await this.ordersService.listPayments(query);
    return {
      data: data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  @Post(':id/verify')
  @Roles(['ADMIN'])
  async verify(
    @Param('id') id: string,
    @Session() session: UserSession,
  ): Promise<
    ApiResponse<{
      orderId: string;
      status: string;
      wasLate: boolean;
      sessionId: string;
      attemptId: string;
    }>
  > {
    const data = await this.ordersService.verify(id, session.user.id);
    return { data };
  }

  @Post(':id/cancel')
  @Roles(['ADMIN'])
  async cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CancelPaymentSchema)) dto: CancelPaymentDto,
  ): Promise<ApiResponse<{ orderId: string; status: string }>> {
    const data = await this.ordersService.cancel(id, dto.reason);
    return { data };
  }
}
