import { Injectable } from '@nestjs/common';
import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentGateway,
  PaymentStatusResult,
} from '../../payments/gateway/payment-gateway.interface';

/**
 * Deterministic in-memory Snap provider for dev/test (MIDTRANS_STUB=true): no
 * network call, and the token is derived from the external id so retries stay
 * idempotent. Status is always PENDING — nothing ever pays in stub mode.
 */
@Injectable()
export class StubSnapProvider implements PaymentGateway {
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const token = `stub-${this.hash(params.externalId)}`;
    return Promise.resolve({
      providerOrderId: params.externalId,
      token,
      redirectUrl: `https://stub.midtrans.local/snap/${token}`,
      transactionId: '',
    });
  }

  getStatus(params: { providerOrderId: string }): Promise<PaymentStatusResult> {
    return Promise.resolve({
      providerOrderId: params.providerOrderId,
      status: 'PENDING',
      paidAmount: null,
      paymentType: null,
    });
  }

  private hash(input: string): string {
    let h = 0;
    for (const ch of input) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h.toString().padStart(10, '0').slice(-14);
  }
}
