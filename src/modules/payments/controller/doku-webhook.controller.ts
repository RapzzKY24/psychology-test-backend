import {
  Body,
  Controller,
  Headers,
  HttpStatus,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import { verifyNotificationSignature } from '../../doku/utils/verify-notification';
import { PaymentsService } from '../service/payments.service';

function header(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

@Controller('api/v1/webhooks/doku')
export class DokuWebhookController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  /** Doku VA payment callback. Anonymous; verified by signature + VA match. */
  @Post('va')
  @AllowAnonymous()
  async vaCallback(
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Res() res: Response,
  ): Promise<void> {
    const verified = verifyNotificationSignature({
      externalId: header(headers, 'x-external-id'),
      timestamp: header(headers, 'x-timestamp'),
      signature: header(headers, 'x-signature'),
      body,
      secretKey: this.config.get<string>('app.doku.secretKey') ?? '',
    });
    if (!verified) throw new UnauthorizedException('invalid_signature');

    const ack = await this.payments.handleVaCallback(body);
    res.status(HttpStatus.OK).json(ack);
  }
}
