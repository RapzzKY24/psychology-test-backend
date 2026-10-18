import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CreateOrderSchema } from '../dto/create-order.dto';
import type { CreateOrderDto } from '../dto/create-order.dto';
import { OrdersService } from '../service/orders.service';
import type { CreateOrderResult } from '../service/orders.service';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateOrderSchema)) dto: CreateOrderDto,
    @Session() session: UserSession,
  ): Promise<ApiResponse<CreateOrderResult>> {
    const data = await this.ordersService.create(dto.testId, session.user.id);
    return { data };
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Session() session: UserSession,
  ): Promise<
    ApiResponse<{
      id: string;
      status: string;
      amount: number;
      basePrice: number;
      uniqueCode: number;
      expiresAt: Date;
      secondsRemaining: number | null;
      userClaimedAt: Date | null;
    }>
  > {
    const data = await this.ordersService.findById(id, session.user.id);
    return { data };
  }

  @Post(':id/claim')
  async claim(
    @Param('id') id: string,
    @Session() session: UserSession,
  ): Promise<ApiResponse<{ id: string; userClaimedAt: Date }>> {
    const data = await this.ordersService.claim(id, session.user.id);
    return { data };
  }
}
