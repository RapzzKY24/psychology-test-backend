import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * Base class for infrastructure failures raised by a payment provider
 * transport.
 *
 * Services above the seam catch this instead of a provider-specific class, so
 * a transport failure never leaves a raw 500 leaking to the client. Each
 * transport keeps its own narrow `code` union.
 */
export abstract class PaymentGatewayError extends Error {
  protected constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
    readonly path?: string,
  ) {
    super(message);
  }
}

/**
 * HTTP failure for a transport error, following the api-contract catalog.
 *
 * A provider that answers 5xx is down, and a request that never got an answer
 * (timeout, refused connection, unreadable payload) is in the same position:
 * waiting may fix it, so the buyer gets 503 `payment_gateway_unavailable` and
 * a reason to retry. A request the provider actively refused (4xx) is our
 * problem to fix and keeps 502 `payment_gateway_failed`. Without the split, a
 * Doku sandbox outage read as "pembayaran gagal diproses".
 */
export function paymentGatewayException(
  error: PaymentGatewayError,
): BadGatewayException | ServiceUnavailableException {
  const unavailable = error.status === undefined || error.status >= 500;
  return unavailable
    ? new ServiceUnavailableException('payment_gateway_unavailable')
    : new BadGatewayException('payment_gateway_failed');
}

/**
 * True for both HTTP failures above. Callers that survive a transport error
 * (the recovery pass) must recognise the 503 as well as the 502 — checking
 * only `BadGatewayException` silently turned an outage into an aborted batch.
 */
export function isPaymentGatewayException(
  error: unknown,
): error is BadGatewayException | ServiceUnavailableException {
  return (
    error instanceof BadGatewayException ||
    error instanceof ServiceUnavailableException
  );
}
