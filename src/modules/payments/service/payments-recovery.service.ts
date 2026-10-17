import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { MS_PER_MINUTE } from '../constants/payments';

/**
 * Periodically replays stale inbound callbacks and reconciles unsettled VA
 * orders against GDC. Runs only when the gateway provider is active; the
 * exactly-once unlock lives in the repository, so overlapping runs are safe.
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
    if (this.config.get<string>('app.paymentProvider') !== 'gdc') return;
    const intervalMs =
      this.config.get<number>('app.recovery.intervalMin', 5) * MS_PER_MINUTE;
    this.timer = setInterval(() => void this.runOnce(), intervalMs);
    this.timer.unref();
    this.logger.log(`VA recovery scheduled every ${intervalMs / 60000} min`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.payments.recoverStaleCallbacks();
      await this.payments.reconcilePendingVas();
    } catch (error) {
      this.logger.warn(
        `VA recovery pass failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
