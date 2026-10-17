import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import { PaymentsService } from '../service/payments.service';

@Controller('api/v1/webhooks/gdc')
export class GdcWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  /** GDC VA payment callback. Anonymous; auth is by VA + amount match. */
  @Post('va')
  @AllowAnonymous()
  async vaCallback(@Body() body: unknown, @Res() res: Response): Promise<void> {
    const ack = await this.payments.handleVaCallback(body);
    res.status(HttpStatus.OK).json(ack);
  }
}
