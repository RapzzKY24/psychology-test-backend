import { Injectable } from '@nestjs/common';
import { DEFAULT_VA_BANK_CODE } from '../constants/jokul';
import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentGateway,
  PaymentStatusResult,
} from '../../payments/gateway/payment-gateway.interface';

/**
 * Deterministic in-memory provider for dev/test (JOKUL_STUB=true): no network
 * call, stable VA generated from the external id so retries stay idempotent.
 */
@Injectable()
export class StubVaProvider implements PaymentGateway {
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    return Promise.resolve({
      providerOrderId: params.externalId,
      token: '',
      redirectUrl: '',
      transactionId: params.externalId,
      vaNumber: `88${this.hash(params.externalId)}`,
      bankCode: DEFAULT_VA_BANK_CODE,
    });
  }

  getStatus(params: {
    providerOrderId: string;
    vaNumber?: string | null;
  }): Promise<PaymentStatusResult> {
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
