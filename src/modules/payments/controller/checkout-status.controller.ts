import { Controller, Get, Param } from '@nestjs/common';
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
}
