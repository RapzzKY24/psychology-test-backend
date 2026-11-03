import { PaymentGatewayError } from '../../payments/gateway/payment-gateway.error';

/**
 * A Doku transport failure.
 *
 * Extends `PaymentGatewayError` so the recovery pass and the buyer-facing
 * refresh can swallow it the same way they swallow a Snap failure, instead of
 * letting a raw 500 escape. `status` is kept because 404 means "no transaction
 * yet" — a normal state for an abandoned checkout, not an outage.
 */
export class DokuApiError extends PaymentGatewayError {
  constructor(
    code: DokuApiErrorCode,
    message: string,
    status?: number,
    path?: string,
  ) {
    super(code, message, status, path);
    this.name = 'DokuApiError';
  }
}

export type DokuApiErrorCode =
  'http_error' | 'connection_failed' | 'unexpected_payload';
