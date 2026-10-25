import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import { MidtransNotificationSchema } from '../../midtrans/dto/midtrans.dto';
import { verifyMidtransSignature } from '../../midtrans/utils/verify-signature';
import { PaymentsService } from '../service/payments.service';

/**
 * Midtrans Snap payment notification.
 *
 * Midtrans retries every non-2xx answer (500 once, 503 four times, 400/404
 * twice, anything else five times), so all business outcomes — unknown order,
 * amount mismatch, non-paid status, unparsable payload — must still answer
 * 200. Only a forged payload (bad signature) is rejected with a non-2xx:
 * acknowledging it would tell Midtrans the notification was delivered.
 */
@Controller('api/v1/webhooks/midtrans')
export class MidtransWebhookController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  /** Anonymous; verified by the SHA512 signature. */
  @Post('notification')
  @AllowAnonymous()
  async notification(
    @Body() body: unknown,
    @Res() res: Response,
  ): Promise<void> {
    const parsed = MidtransNotificationSchema.safeParse(body);

    if (parsed.success) {
      const verified = verifyMidtransSignature({
        orderId: parsed.data.order_id,
        statusCode: parsed.data.status_code,
        grossAmount: parsed.data.gross_amount,
        signatureKey: parsed.data.signature_key,
        serverKey: this.config.get<string>('app.midtrans.serverKey') ?? '',
      });
      if (!verified) throw new UnauthorizedException('invalid_signature');
    }

    // An unparsable payload is still handed to the service so it is recorded
    // for investigation, and acked: a schema mismatch must never become a
    // retry storm.
    const ack = await this.payments.handleNotification(body);
    res.status(HttpStatus.OK).json(ack);
  }
}
