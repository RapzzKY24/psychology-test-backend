import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseOrThrow } from '../../../common/utils/zod-parse';
import { EventLogService } from '../../event-log/service/event-log.service';
import { IdempotencyService } from '../../idempotency/service/idempotency.service';
import { OrdersService } from '../../orders/service/orders.service';
import { GdcClient } from '../../gdc/client/gdc.client';
import { GdcApiError } from '../../gdc/errors/gdc-api.error';
import { VaCallbackSchema } from '../../gdc/dto/gdc.dto';
import type { VaCallback } from '../../gdc/dto/gdc.dto';
import {
  GDC_ACK,
  MS_PER_MINUTE,
  VA_CALLBACK_EVENT_TYPE,
  VA_CALLBACK_KEY_PREFIX,
  VA_CALLBACK_PAID_STATUS,
  VA_CALLBACK_SCOPE,
  VA_INQUIRY_PAID_STATUS,
} from '../constants/payments';
import type { GdcAck } from '../constants/payments';

type CallbackOutcome =
  | { kind: 'settled' }
  | { kind: 'ignored'; reason: string }
  | { kind: 'rejected'; reason: string };

@Injectable()
export class PaymentsService {
  constructor(
    private readonly orders: OrdersService,
    private readonly eventLog: EventLogService,
    private readonly idempotency: IdempotencyService,
    private readonly gdc: GdcClient,
    private readonly config: ConfigService,
  ) {}

  private get staleAfterMs(): number {
    return (
      this.config.get<number>('app.recovery.staleAfterMin', 5) * MS_PER_MINUTE
    );
  }

  private get lookbackMs(): number {
    return (
      this.config.get<number>('app.recovery.lookbackMin', 1440) * MS_PER_MINUTE
    );
  }

  private get batchSize(): number {
    return this.config.get<number>('app.recovery.batchSize', 50);
  }

  /**
   * Handle a VA payment callback from GDC. Idempotent per
   * `virtualAccountNo:referenceNo`, always acknowledges with the SNAP 2000000
   * envelope so the gateway does not retry on our business-level outcomes.
   */
  async handleVaCallback(body: unknown): Promise<GdcAck> {
    const payload = parseOrThrow(VaCallbackSchema, body);
    const key = `${VA_CALLBACK_KEY_PREFIX}${payload.virtualAccountNo}:${payload.referenceNo}`;

    const claim = await this.idempotency.begin({
      scope: VA_CALLBACK_SCOPE,
      key,
    });
    if (!claim.acquired) return GDC_ACK;

    const event = await this.eventLog.record({
      source: 'GDC',
      direction: 'INBOUND',
      type: VA_CALLBACK_EVENT_TYPE,
      reference: payload.referenceNo,
      idempotencyKey: key,
      payload: this.redact(payload),
    });

    const outcome = await this.applyCallback(payload, event.id);
    if (outcome.kind === 'rejected') {
      await this.idempotency.fail(claim.id, { errorMessage: outcome.reason });
    } else {
      await this.idempotency.complete(claim.id, {
        responseStatus: 200,
        responseBody: GDC_ACK,
      });
    }
    return GDC_ACK;
  }

  /** Replay inbound callbacks that were never finalized (e.g. a crash mid-handling). */
  async recoverStaleCallbacks(): Promise<number> {
    const stale = await this.eventLog.findStaleForRecovery({
      olderThan: new Date(Date.now() - this.staleAfterMs),
      limit: this.batchSize,
    });
    let replayed = 0;
    for (const event of stale) {
      if (event.type !== VA_CALLBACK_EVENT_TYPE || event.payload === null) {
        continue;
      }
      const parsed = VaCallbackSchema.safeParse(event.payload);
      if (!parsed.success) {
        await this.eventLog.markFailed(event.id, {
          errorMessage: 'unparsable_payload',
        });
        continue;
      }
      await this.eventLog.markProcessing(event.id);
      await this.applyCallback(parsed.data, event.id);
      replayed += 1;
    }
    return replayed;
  }

  /** Poll GDC for VA orders still unsettled after expiry and unlock any that were paid. */
  async reconcilePendingVas(): Promise<{ checked: number; settled: number }> {
    const now = new Date();
    const due = await this.orders.findUnsettledVaOrders({
      dueBefore: now,
      notBefore: new Date(now.getTime() - this.lookbackMs),
      limit: this.batchSize,
    });
    let checked = 0;
    let settled = 0;
    for (const order of due) {
      if (!order.vaNumber) continue;
      checked += 1;
      let status: Awaited<ReturnType<GdcClient['inquiryVaStatus']>>;
      try {
        status = await this.gdc.inquiryVaStatus(
          {
            virtualAccountNo: order.vaNumber,
            paymentRequestId: order.gdcTrxId ?? order.id,
          },
          order.gdcExternalId ?? order.id,
        );
      } catch (error) {
        if (error instanceof GdcApiError) continue;
        throw error;
      }
      if (status.paymentFlagStatus !== VA_INQUIRY_PAID_STATUS) continue;
      const paidAmount = Number(status.totalAmount?.value);
      if (!Number.isFinite(paidAmount) || paidAmount !== order.amount) continue;
      const result = await this.orders.confirmExternalPayment(order.id);
      if (result.outcome === 'verified') settled += 1;
    }
    return { checked, settled };
  }

  private async applyCallback(
    payload: VaCallback,
    eventId: string,
  ): Promise<CallbackOutcome> {
    const order = await this.orders.findByVaNumber(payload.virtualAccountNo);
    if (!order) {
      await this.eventLog.markFailed(eventId, {
        errorMessage: 'order_not_found',
      });
      return { kind: 'rejected', reason: 'order_not_found' };
    }

    if (
      payload.additionalInfo.latestTransactionStatus !== VA_CALLBACK_PAID_STATUS
    ) {
      await this.eventLog.markProcessed(eventId, {
        response: { ignored: payload.additionalInfo.latestTransactionStatus },
      });
      return { kind: 'ignored', reason: 'non_paid_status' };
    }

    const paidAmount = Number(payload.totalAmount.value);
    if (!Number.isFinite(paidAmount) || paidAmount !== order.amount) {
      await this.eventLog.markFailed(eventId, {
        errorMessage: 'amount_mismatch',
      });
      return { kind: 'rejected', reason: 'amount_mismatch' };
    }

    const result = await this.orders.confirmExternalPayment(order.id);
    if (result.outcome === 'conflict') {
      await this.eventLog.markProcessed(eventId, {
        response: { alreadySettled: true, orderId: order.id },
      });
      return { kind: 'ignored', reason: 'already_settled' };
    }
    if (result.outcome !== 'verified') {
      await this.eventLog.markFailed(eventId, {
        errorMessage: `settle_${result.outcome}`,
      });
      return { kind: 'rejected', reason: `settle_${result.outcome}` };
    }

    await this.eventLog.markProcessed(eventId, {
      response: {
        orderId: order.id,
        sessionId: result.sessionId,
        wasLate: result.wasLate,
      },
    });
    return { kind: 'settled' };
  }

  private redact(payload: VaCallback): Record<string, unknown> {
    return {
      virtualAccountNo: payload.virtualAccountNo,
      trxId: payload.trxId,
      paymentRequestId: payload.paymentRequestId,
      referenceNo: payload.referenceNo,
      sourceBankCode: payload.sourceBankCode,
      paidAmount: payload.paidAmount,
      totalAmount: payload.totalAmount,
      trxDateTime: payload.trxDateTime,
      latestTransactionStatus: payload.additionalInfo.latestTransactionStatus,
      transactionType: payload.additionalInfo.transactionType,
    };
  }
}
