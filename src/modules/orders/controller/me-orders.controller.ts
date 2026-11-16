import { Controller, Get, Query } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { QueryMeOrdersSchema } from '../dto/me-order.dto';
import type { MeOrderItemDto, QueryMeOrdersDto } from '../dto/me-order.dto';
import { MeOrdersService } from '../service/me-orders.service';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/me/orders')
export class MeOrdersController {
  constructor(private readonly meOrders: MeOrdersService) {}

  /** The caller's own purchases, newest first; `?status=` narrows the tab. */
  @Get()
  async list(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(QueryMeOrdersSchema))
    query: QueryMeOrdersDto,
  ): Promise<PaginatedResponse<MeOrderItemDto>> {
    return this.meOrders.list(session.user.id, query);
  }
}
