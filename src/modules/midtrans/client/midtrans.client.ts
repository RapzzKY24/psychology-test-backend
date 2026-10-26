import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MidtransStatusResponseSchema,
  SnapTransactionRequestSchema,
  SnapTransactionResponseSchema,
} from '../dto/midtrans.dto';
import { MidtransApiError } from '../errors/midtrans-api.error';
import { midtransApiBaseUrl, midtransSnapBaseUrl } from './midtrans.config';
import type { MidtransConfig } from './midtrans.config';

const SNAP_TRANSACTIONS_PATH = '/snap/v1/transactions';

const JAKARTA_OFFSET_MINUTES = 7 * 60;
const MILLIS_PER_MINUTE = 60_000;

export interface CreateSnapTransactionInput {
  providerOrderId: string;
  amount: number;
  expiresAt: Date;
  customer?: { name?: string; email?: string; phone?: string };
}

export interface SnapTransactionResult {
  token: string;
  redirectUrl: string;
}

export interface MidtransStatusResult {
  orderId: string;
  /** Raw Midtrans value; the caller maps it to a gateway status. */
  transactionStatus: string;
  fraudStatus: string | null;
  /** Raw decimal string, e.g. `"200000.00"`. */
  grossAmount: string;
  paymentType: string | null;
  transactionId: string | null;
}

interface SnapTransactionRequestBody {
  transaction_details: { order_id: string; gross_amount: number };
  expiry: { start_time: string; unit: 'minute'; duration: number };
  callbacks?: { finish: string };
  customer_details?: { first_name: string; email?: string };
}

/**
 * `callbacks` and `customer_details` are only sent when they are configured,
 * so they are relaxed to optional here. Everything else keeps the foundation
 * schema's validation.
 */
const SnapTransactionRequestBodySchema = SnapTransactionRequestSchema.partial({
  callbacks: true,
  customer_details: true,
});

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/**
 * Midtrans answers HTTP 200 with `{ "status_code": "404", "status_message":
 * "Transaction doesn't exist." }` while the customer has not picked a payment
 * method yet. The HTTP status is therefore useless here; the body decides.
 */
function isNotFoundPayload(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { status_code?: unknown }).status_code === '404'
  );
}

/**
 * `YYYY-MM-DD HH:mm:ss +0700`, the format Midtrans expects for
 * `expiry.start_time`. Computed in UTC+7 regardless of the server timezone.
 */
export function jakartaTimestamp(date: Date): string {
  const shifted = new Date(date.getTime() + JAKARTA_OFFSET_MINUTES * 60 * 1000);
  const ymd = [
    shifted.getUTCFullYear(),
    pad(shifted.getUTCMonth() + 1),
    pad(shifted.getUTCDate()),
  ].join('-');
  const hms = [
    pad(shifted.getUTCHours()),
    pad(shifted.getUTCMinutes()),
    pad(shifted.getUTCSeconds()),
  ].join(':');
  return `${ymd} ${hms} +0700`;
}

@Injectable()
export class MidtransClient {
  constructor(private readonly config: ConfigService) {}

  private get cfg(): MidtransConfig {
    return this.config.get<MidtransConfig>('app.midtrans')!;
  }

  /** Basic auth is `serverKey` + an empty password. Never logged. */
  private authorizationHeader(cfg: MidtransConfig): string {
    if (!cfg.serverKey && !cfg.stub) {
      throw new MidtransApiError(
        'unauthorized',
        'Midtrans server key is not configured',
      );
    }
    return `Basic ${Buffer.from(`${cfg.serverKey}:`).toString('base64')}`;
  }

  /** Maps an HTTP failure onto a machine code; never echoes the credentials. */
  private httpError(status: number, path: string): MidtransApiError {
    const message = `Midtrans request failed: ${path} (HTTP ${status})`;
    if (status === 401) {
      return new MidtransApiError('unauthorized', message, status, path);
    }
    if (status === 404) {
      return new MidtransApiError('not_found', message, status, path);
    }
    if (status === 406) {
      return new MidtransApiError('order_id_taken', message, status, path);
    }
    return new MidtransApiError('request_failed', message, status, path);
  }

  private async send(
    cfg: MidtransConfig,
    method: 'GET' | 'POST',
    url: string,
    path: string,
    body?: string,
  ): Promise<Response> {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: this.authorizationHeader(cfg),
      },
      body,
    });
    if (!response.ok) {
      throw this.httpError(response.status, path);
    }
    return response;
  }

  /**
   * Creates a Snap transaction. `expiry.start_time` is pinned to now so the
   * countdown starts at creation; without it Midtrans starts counting when the
   * customer picks a payment method and the deadline drifts from `expiresAt`.
   */
  async createSnapTransaction(
    input: CreateSnapTransactionInput,
  ): Promise<SnapTransactionResult> {
    const cfg = this.cfg;
    const now = new Date();
    const duration = Math.max(
      1,
      Math.ceil(
        (input.expiresAt.getTime() - now.getTime()) / MILLIS_PER_MINUTE,
      ),
    );

    const request: SnapTransactionRequestBody = {
      transaction_details: {
        order_id: input.providerOrderId,
        gross_amount: input.amount,
      },
      expiry: {
        start_time: jakartaTimestamp(now),
        unit: 'minute',
        duration,
      },
    };

    if (cfg.finishUrl) {
      request.callbacks = { finish: cfg.finishUrl };
    }

    if (input.customer) {
      const customerDetails: { first_name: string; email?: string } = {
        first_name: input.customer.name ?? input.providerOrderId,
      };
      if (input.customer.email) {
        customerDetails.email = input.customer.email;
      }
      request.customer_details = customerDetails;
    }

    const parsedRequest = SnapTransactionRequestBodySchema.safeParse(request);
    if (!parsedRequest.success) {
      throw new MidtransApiError(
        'request_failed',
        'Invalid Midtrans create-snap request',
        undefined,
        SNAP_TRANSACTIONS_PATH,
      );
    }

    const response = await this.send(
      cfg,
      'POST',
      `${midtransSnapBaseUrl(cfg)}${SNAP_TRANSACTIONS_PATH}`,
      SNAP_TRANSACTIONS_PATH,
      JSON.stringify(parsedRequest.data),
    );

    const payload: unknown = await response.json();
    const parsedResponse = SnapTransactionResponseSchema.safeParse(payload);
    if (!parsedResponse.success) {
      throw new MidtransApiError(
        'request_failed',
        'Unexpected Midtrans create-snap response',
        response.status,
        SNAP_TRANSACTIONS_PATH,
      );
    }

    return {
      token: parsedResponse.data.token,
      redirectUrl: parsedResponse.data.redirect_url,
    };
  }

  /**
   * Status lookup. Midtrans answers 404 `Payment Not Found` until the customer
   * picks a payment method, so a `not_found` error here means "still pending"
   * to the caller — never a failure.
   */
  async getStatus(providerOrderId: string): Promise<MidtransStatusResult> {
    const cfg = this.cfg;
    const path = `/v2/${encodeURIComponent(providerOrderId)}/status`;
    const response = await this.send(
      cfg,
      'GET',
      `${midtransApiBaseUrl(cfg)}${path}`,
      path,
    );

    const payload: unknown = await response.json();
    if (isNotFoundPayload(payload)) {
      throw new MidtransApiError(
        'not_found',
        `Midtrans request failed: ${path} (404)`,
        404,
        path,
      );
    }
    const parsed = MidtransStatusResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new MidtransApiError(
        'request_failed',
        'Unexpected Midtrans status response',
        response.status,
        path,
      );
    }

    const data = parsed.data;
    return {
      orderId: data.order_id,
      transactionStatus: data.transaction_status,
      fraudStatus: data.fraud_status ?? null,
      grossAmount: data.gross_amount,
      paymentType: data.payment_type ?? null,
      transactionId: data.transaction_id ?? null,
    };
  }

  /**
   * Expires a pending transaction so its `order_id` cannot be paid. A body
   * level 404 means there is nothing to expire yet (no payment method was ever
   * chosen), which is reported as `not_found` instead of a silent success.
   */
  async expire(providerOrderId: string): Promise<void> {
    const cfg = this.cfg;
    const path = `/v2/${encodeURIComponent(providerOrderId)}/expire`;
    const response = await this.send(
      cfg,
      'POST',
      `${midtransApiBaseUrl(cfg)}${path}`,
      path,
    );
    const payload: unknown = await response.json().catch(() => null);
    if (isNotFoundPayload(payload)) {
      throw new MidtransApiError(
        'not_found',
        `Midtrans request failed: ${path} (404)`,
        404,
        path,
      );
    }
  }
}
