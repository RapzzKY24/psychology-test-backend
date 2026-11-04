import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  PaymentGatewayError,
  paymentGatewayException,
} from '../gateway/payment-gateway.error';

class FakeGatewayError extends PaymentGatewayError {
  constructor(status?: number) {
    super('fake', 'boom', status, '/x');
  }
}

function exceptionFor(status?: number) {
  return paymentGatewayException(new FakeGatewayError(status));
}

function codeOf(status?: number): string {
  const response = exceptionFor(status).getResponse() as { message: string };
  return response.message;
}

describe('paymentGatewayException', () => {
  /**
   * Regression: a Doku sandbox outage (503) surfaced as 502
   * "pembayaran gagal diproses", which tells the buyer their payment failed
   * rather than that the provider is down and a retry may work.
   */
  it('answers 503 when the provider is down', () => {
    for (const status of [500, 503]) {
      expect(exceptionFor(status)).toBeInstanceOf(ServiceUnavailableException);
      expect(codeOf(status)).toBe('payment_gateway_unavailable');
    }
  });

  it('calls a transport error with no answer an outage too', () => {
    expect(exceptionFor(undefined)).toBeInstanceOf(ServiceUnavailableException);
    expect(codeOf(undefined)).toBe('payment_gateway_unavailable');
  });

  it('answers 502 when the provider refused the request', () => {
    for (const status of [400, 401, 422]) {
      expect(exceptionFor(status)).toBeInstanceOf(BadGatewayException);
      expect(codeOf(status)).toBe('payment_gateway_failed');
    }
  });
});
