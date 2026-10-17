import { Injectable } from '@nestjs/common';
import { parseOrThrow } from '../../../common/utils/zod-parse';
import { EventLogService } from '../../event-log/service/event-log.service';
import { IdempotencyService } from '../../idempotency/service/idempotency.service';
import { OrdersService } from '../../orders/service/orders.service';
import { VaCallbackSchema } from '../../gdc/dto/gdc.dto';
import type { VaCallback } from '../../gdc/dto/gdc.dto';
import {
  GDC_ACK,
  VA_CALLBACK_KEY_PREFIX,
  VA_CALLBACK_PAID_STATUS,
  VA_CALLBACK_SCOPE,
} from '../constants/payments';
import type { GdcAck } from '../constants/payments';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly orders: OrdersService,
    private readonly eventLog: EventLogService,
    private readonly idempotency: IdempotencyService,
  ) {}

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
      type: 'VA_CALLBACK_RECEIVED',
      reference: payload.referenceNo,
      idempotencyKey: key,
      payload: this.redact(payload),
    });

    const order = await this.orders.findByVaNumber(payload.virtualAccountNo);
    if (!order) {
      return this.reject(claim.id, event.id, 'order_not_found');
    }

    if (
      payload.additionalInfo.latestTransactionStatus !== VA_CALLBACK_PAID_STATUS
    ) {
      await this.eventLog.markProcessed(event.id, {
        response: {
          ignored: payload.additionalInfo.latestTransactionStatus,
        },
      });
      await this.idempotency.complete(claim.id, {
        responseStatus: 200,
        responseBody: GDC_ACK,
      });
      return GDC_ACK;
    }

    const paidAmount = Number(payload.totalAmount.value);
    if (!Number.isFinite(paidAmount) || paidAmount !== order.amount) {
      return this.reject(claim.id, event.id, 'amount_mismatch');
    }

    const result = await this.orders.confirmExternalPayment(order.id);
    if (result.outcome !== 'verified') {
      return this.reject(claim.id, event.id, `settle_${result.outcome}`);
    }

    await this.eventLog.markProcessed(event.id, {
      response: {
        orderId: order.id,
        sessionId: result.sessionId,
        wasLate: result.wasLate,
      },
    });
    await this.idempotency.complete(claim.id, {
      responseStatus: 200,
      responseBody: GDC_ACK,
    });
    return GDC_ACK;
  }

  private async reject(
    claimId: string,
    eventId: string,
    reason: string,
  ): Promise<GdcAck> {
    await this.eventLog.markFailed(eventId, { errorMessage: reason });
    await this.idempotency.fail(claimId, { errorMessage: reason });
    return GDC_ACK;
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
