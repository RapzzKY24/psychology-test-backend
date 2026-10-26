import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MidtransClient } from '../client/midtrans.client';
import { MidtransApiError } from '../errors/midtrans-api.error';
import { mapTransactionStatus } from '../utils/map-status';
import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentGateway,
  PaymentStatusResult,
} from '../../payments/gateway/payment-gateway.interface';

/** Midtrans rejects an `order_id` longer than this. */
const MIDTRANS_ORDER_ID_MAX_LENGTH = 50;

/**
 * Builds the retry id for a rejected `order_id`. The base is trimmed so the
 * suffix always fits: the invoice reprovision id (`<uuid>-<amount>`) plus a
 * suffix would otherwise exceed the 50-character cap.
 */
function withRetrySuffix(externalId: string): string {
  const suffix = `-${Date.now().toString(36)}`;
  return `${externalId.slice(0, MIDTRANS_ORDER_ID_MAX_LENGTH - suffix.length)}${suffix}`;
}

/**
 * `PaymentGateway` backed by the real Midtrans Snap client.
 *
 * Snap is a redirect flow: the customer leaves the app, so the only durable
 * keys Midtrans echoes back are `order_id` (our `providerOrderId`) and the
 * notification signature. Everything else is derived from a status lookup.
 */
@Injectable()
export class MidtransSnapProvider implements PaymentGateway {
  constructor(
    private readonly client: MidtransClient,
    private readonly config: ConfigService,
  ) {}

  async createPayment(
    params: CreatePaymentParams,
  ): Promise<CreatePaymentResult> {
    try {
      return await this.create(params, params.externalId);
    } catch (error) {
      // Midtrans rejects a reused `order_id` with 406 once the earlier
      // transaction reached pending/paid. One retry with a suffixed id keeps
      // the invoice payable; the caller persists the returned id, so later
      // notifications still resolve.
      if (
        error instanceof MidtransApiError &&
        error.code === 'order_id_taken'
      ) {
        return this.create(params, withRetrySuffix(params.externalId));
      }
      throw error;
    }
  }

  async getStatus(params: {
    providerOrderId: string;
  }): Promise<PaymentStatusResult> {
    const { providerOrderId } = params;
    try {
      const status = await this.client.getStatus(providerOrderId);
      return {
        providerOrderId,
        status: mapTransactionStatus(
          status.transactionStatus,
          status.fraudStatus,
        ),
        paidAmount: Number(status.grossAmount),
        paymentType: status.paymentType,
      };
    } catch (error) {
      // Midtrans returns 404 `Payment Not Found` until the customer selects a
      // payment method, so 404 means "not payable yet", not "unknown order".
      if (error instanceof MidtransApiError && error.code === 'not_found') {
        return {
          providerOrderId,
          status: 'PENDING',
          paidAmount: null,
          paymentType: null,
        };
      }
      throw error;
    }
  }

  private async create(
    params: CreatePaymentParams,
    providerOrderId: string,
  ): Promise<CreatePaymentResult> {
    const snap = await this.client.createSnapTransaction({
      providerOrderId,
      amount: params.amount,
      expiresAt: params.expiresAt,
      customer: params.customer,
    });
    return {
      providerOrderId,
      token: snap.token,
      redirectUrl: snap.redirectUrl,
      // Snap assigns no transaction id until the customer picks a method, so
      // the id arrives later with the notification, never at creation.
      transactionId: '',
    };
  }
}
