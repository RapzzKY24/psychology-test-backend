import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { ZodType } from 'zod';
import {
  DOKU_BASE_URL,
  DOKU_CHECK_STATUS_TARGET,
  DOKU_CONNECT_ERROR_CODES,
  DOKU_CREATE_PAYMENT_TARGET,
  DOKU_TIMEOUT_MS,
} from '../constants/doku';
import { DokuApiError } from '../errors/doku-api.error';
import {
  DokuCreatePaymentResponseSchema,
  DokuStatusResponseSchema,
} from '../dto/doku.dto';
import type {
  DokuCreatePaymentResponse,
  DokuStatusResponse,
} from '../dto/doku.dto';
import {
  buildSignatureComponent,
  formatDokuTimestamp,
  generateDigest,
  signComponent,
} from '../utils/doku-signature';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_000;

export interface DokuCreatePaymentInput {
  invoiceNumber: string;
  amount: number;
  /** Doku takes a duration, not a deadline. */
  dueMinutes: number;
  customer?: { name?: string; email?: string; phone?: string };
  /** Browser lands here after paying. */
  callbackUrl?: string;
  /** Doku reports the result here. */
  callbackUrlResult?: string;
}

/**
 * HTTP + signature transport for Doku Checkout.
 *
 * Knows nothing about orders, invoices or settlement: it signs a request, sends
 * it, and returns the parsed payload. Everything above lives behind
 * `PaymentGateway`.
 */
@Injectable()
export class DokuClient {
  private readonly logger = new Logger(DokuClient.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.clientId && this.secretKey);
  }

  async createPayment(
    input: DokuCreatePaymentInput,
  ): Promise<DokuCreatePaymentResponse> {
    const body = JSON.stringify({
      order: {
        amount: input.amount,
        invoice_number: input.invoiceNumber,
        currency: 'IDR',
        callback_url: input.callbackUrl,
        callback_url_result: input.callbackUrlResult,
        auto_redirect: true,
      },
      payment: { payment_due_date: input.dueMinutes },
      customer: input.customer,
    });

    const raw = await this.send('POST', DOKU_CREATE_PAYMENT_TARGET, body);
    return this.parse(
      DokuCreatePaymentResponseSchema,
      raw,
      DOKU_CREATE_PAYMENT_TARGET,
    );
  }

  async getStatus(invoiceNumber: string): Promise<DokuStatusResponse> {
    // The invoice number is a path segment AND part of the signature target.
    const target = `${DOKU_CHECK_STATUS_TARGET}/${encodeURIComponent(invoiceNumber)}`;
    const raw = await this.send('GET', target);
    return this.parse(DokuStatusResponseSchema, raw, target);
  }

  private get baseUrl(): string {
    return this.config.get<boolean>('app.doku.isProduction')
      ? DOKU_BASE_URL.production
      : DOKU_BASE_URL.sandbox;
  }

  private get clientId(): string {
    return this.config.get<string>('app.doku.clientId') ?? '';
  }

  private get secretKey(): string {
    return this.config.get<string>('app.doku.secretKey') ?? '';
  }

  private async send(
    method: 'GET' | 'POST',
    target: string,
    body?: string,
  ): Promise<unknown> {
    const response = await this.fetchWithRetry(`${this.baseUrl}${target}`, {
      method,
      headers: this.headers(target, body),
      body,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      // 404 on a status lookup is an abandoned checkout, not an outage; the
      // caller decides, so it is logged at warn instead of error.
      const line = `DOKU ${method} ${target} failed (${response.status}): ${detail.slice(0, 300)}`;
      if (response.status === 404) this.logger.warn(line);
      else this.logger.error(line);
      throw new DokuApiError(
        'http_error',
        `DOKU ${method} ${target} failed with status ${response.status}`,
        response.status,
        target,
      );
    }

    return response.json();
  }

  /**
   * Signed headers for one request. `Request-Id` is fresh per attempt: Doku
   * rejects a replay of the same id.
   */
  private headers(target: string, body?: string): Record<string, string> {
    const requestId = randomUUID();
    const timestamp = formatDokuTimestamp(new Date());
    const digest = body === undefined ? undefined : generateDigest(body);
    const signature = signComponent(
      this.secretKey,
      buildSignatureComponent({
        clientId: this.clientId,
        requestId,
        timestamp,
        requestTarget: target,
        digest,
      }),
    );

    return {
      'Content-Type': 'application/json',
      'Client-Id': this.clientId,
      'Request-Id': requestId,
      'Request-Timestamp': timestamp,
      Signature: signature,
    };
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
      try {
        return await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(DOKU_TIMEOUT_MS),
        });
      } catch (error) {
        lastError = error;
        const code = (error as { cause?: { code?: string } }).cause?.code;
        const retryable =
          code !== undefined && DOKU_CONNECT_ERROR_CODES.has(code);
        if (!retryable || attempt === RETRY_ATTEMPTS) break;
        this.logger.warn(
          `DOKU connection failure (${code}) on attempt ${attempt}/${RETRY_ATTEMPTS}; retrying`,
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    throw new DokuApiError(
      'connection_failed',
      `DOKU request failed: ${lastError instanceof Error ? lastError.message : 'unknown_error'}`,
    );
  }

  /** A payload we cannot read is a transport failure, never a raw 500. */
  private parse<T>(schema: ZodType<T>, raw: unknown, target: string): T {
    const result = schema.safeParse(raw);
    if (!result.success) {
      this.logger.error(`DOKU ${target} returned an unexpected payload`);
      throw new DokuApiError(
        'unexpected_payload',
        `DOKU ${target} returned an unexpected payload`,
        undefined,
        target,
      );
    }
    return result.data;
  }
}
