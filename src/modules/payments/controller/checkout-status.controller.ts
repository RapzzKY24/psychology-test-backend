import { Controller, Get, Param, Post } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { CheckoutStatusService } from '../service/checkout-status.service';
import type { CheckoutStatusDto } from '../dto/checkout-status.dto';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';

/** Payment result page: the invoice or order behind a checkout reference. */
@Controller('api/v1/payments')
export class CheckoutStatusController {
  constructor(private readonly checkoutStatus: CheckoutStatusService) {}

  @Get('checkout/:ref')
  async find(
    @Param('ref') ref: string,
    @Session() session: UserSession,
  ): Promise<ApiResponse<CheckoutStatusDto>> {
    const data = await this.checkoutStatus.find(ref, session.user.id);
    return { data };
  }

  /**
   * Ask the gateway whether the payment behind `ref` settled, then answer with
   * the fresh status. Idempotent: the settle path is guarded by the invoice /
   * order state, so repeated calls are safe.
   */
  @Post('checkout/:ref/refresh')
  async refresh(
    @Param('ref') ref: string,
    @Session() session: UserSession,
  ): Promise<ApiResponse<CheckoutStatusDto>> {
    const data = await this.checkoutStatus.refresh(ref, session.user.id);
    return { data };
  }
}
