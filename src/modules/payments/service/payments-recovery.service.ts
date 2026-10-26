import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { MS_PER_MINUTE } from '../../../common/constants/time';

/**
 * Periodically replays stale inbound callbacks and reconciles unsettled
 * payments against the active gateway. Runs for any provider except `manual`;
 * the exactly-once unlock lives in the repository, so overlapping runs are
 * safe.
 */
@Injectable()
export class PaymentsRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsRecoveryService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('app.paymentProvider') === 'manual') return;
    const intervalMs =
      this.config.get<number>('app.recovery.intervalMin', 5) * MS_PER_MINUTE;
    this.timer = setInterval(() => void this.runOnce(), intervalMs);
    this.timer.unref();
    this.logger.log(
      `Payment recovery scheduled every ${intervalMs / MS_PER_MINUTE} min`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.payments.recoverStaleCallbacks();
      await this.payments.recoverStaleProvisioning();
      await this.payments.reconcilePendingPayments();
      await this.payments.recoverStaleInvoiceProvisioning();
      await this.payments.reconcileUnsettledInvoicePayments();
    } catch (error) {
      this.logger.warn(
        `Payment recovery pass failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
