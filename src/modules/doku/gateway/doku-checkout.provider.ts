import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DokuClient } from '../client/doku.client';
import { DokuApiError } from '../errors/doku-api.error';
import { toRupiah } from '../utils/doku-amount';
import { mapDokuStatus } from '../utils/map-doku-status';
import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentGateway,
  PaymentStatusResult,
} from '../../payments/gateway/payment-gateway.interface';

const MILLIS_PER_MINUTE = 60_000;

/** Doku takes a duration, and rejects one that has already elapsed. */
function toDueMinutes(expiresAt: Date): number {
  return Math.max(
    1,
    Math.ceil((expiresAt.getTime() - Date.now()) / MILLIS_PER_MINUTE),
  );
}

/**
 * `PaymentGateway` backed by Doku Checkout.
 *
 * Checkout is a redirect flow, like Snap: the buyer leaves the app, so the only
 * durable key Doku echoes back is the `invoice_number` we sent (our
 * `providerOrderId`). There is no token and no transaction id at creation, and
 * the VA columns stay null — the hosted page covers VA, QRIS and e-wallets.
 */
@Injectable()
export class DokuCheckoutProvider implements PaymentGateway {
  constructor(
    private readonly client: DokuClient,
    private readonly config: ConfigService,
  ) {}

  async createPayment(
    params: CreatePaymentParams,
  ): Promise<CreatePaymentResult> {
    const resultUrl = this.resultUrl(params.externalId);
    const response = await this.client.createPayment({
      invoiceNumber: params.externalId,
      amount: params.amount,
      dueMinutes: toDueMinutes(params.expiresAt),
      customer: params.customer,
      callbackUrl: resultUrl,
      callbackUrlResult: resultUrl,
    });

    return {
      providerOrderId: params.externalId,
      // Checkout has no token; the hosted URL is the only handle.
      token: '',
      redirectUrl: response.response.payment.url,
      transactionId: '',
    };
  }

  async getStatus(params: {
    providerOrderId: string;
  }): Promise<PaymentStatusResult> {
    try {
      const status = await this.client.getStatus(params.providerOrderId);
      return {
        providerOrderId: params.providerOrderId,
        status: mapDokuStatus(status.transaction.status),
        paidAmount: toRupiah(status.order?.amount),
        // The status API names no channel; it arrives with the callback.
        paymentType: null,
      };
    } catch (error) {
      // Doku answers 404 until the buyer opens the hosted page and starts a
      // transaction: "not payable yet", not "unknown order".
      if (error instanceof DokuApiError && error.status === 404) {
        return {
          providerOrderId: params.providerOrderId,
          status: 'PENDING',
          paidAmount: null,
          paymentType: null,
        };
      }
      throw error;
    }
  }

  /**
   * Where Doku sends the buyer back. The reference id is our own, so the result
   * page resolves the checkout directly. Unset config omits both callbacks
   * rather than sending an empty string Doku would reject.
   */
  private resultUrl(externalId: string): string | undefined {
    const base = this.config.get<string>('app.doku.resultUrlBase');
    if (!base) return undefined;
    return `${base.replace(/\/$/, '')}/${encodeURIComponent(externalId)}`;
  }
}
