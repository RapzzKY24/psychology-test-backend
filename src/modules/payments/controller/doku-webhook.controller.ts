import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Request, Response } from 'express';
import { DOKU_ACK } from '../../doku/constants/doku';
import { DokuNotificationSchema } from '../../doku/dto/doku.dto';
import { verifyDokuSignature } from '../../doku/utils/doku-signature';
import { toDokuPaymentNotification } from '../../doku/utils/to-payment-notification';
import { PaymentsService } from '../service/payments.service';

/**
 * Doku Checkout payment notification.
 *
 * The signature is checked **before** the body is parsed, because unlike Snap
 * Doku signs a digest of the raw bytes — the raw body is the proof, so nothing
 * is read from it until it is trusted. A forged payload answers `401`;
 * everything else answers `200 { message: 'OK' }`, because Doku retries every
 * non-2xx and a retry storm over an unknown invoice is worse than a logged miss.
 */
@Controller('api/v1/webhooks/doku')
export class DokuWebhookController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  /** Anonymous; verified by the HMAC-SHA256 signature over the raw body. */
  @Post('notification')
  @AllowAnonymous()
  async notification(
    @Req() req: Request,
    @Body() body: unknown,
    @Res() res: Response,
  ): Promise<void> {
    const verified = verifyDokuSignature({
      headers: req.headers,
      rawBody:
        (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ??
        '',
      clientId: this.config.get<string>('app.doku.clientId') ?? '',
      secretKey: this.config.get<string>('app.doku.secretKey') ?? '',
      notificationPath:
        this.config.get<string>('app.doku.notificationPath') ?? '',
    });
    if (!verified) throw new UnauthorizedException('invalid_signature');

    const parsed = DokuNotificationSchema.safeParse(body);
    if (!parsed.success) {
      // Recorded for investigation and acked: a schema mismatch must never
      // become a retry storm.
      await this.payments.recordUnparsable({ source: 'DOKU', payload: body });
      res.status(HttpStatus.OK).json(DOKU_ACK);
      return;
    }

    await this.payments.handleNotification(
      toDokuPaymentNotification(parsed.data),
    );
    res.status(HttpStatus.OK).json(DOKU_ACK);
  }
}
