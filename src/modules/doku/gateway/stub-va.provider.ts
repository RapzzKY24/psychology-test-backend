import { Injectable } from '@nestjs/common';
import { DEFAULT_VA_BANK_CODE } from '../constants/doku';
import type {
  CreateVaParams,
  CreateVaResult,
  PaymentGateway,
  VaInquiryParams,
  VaInquiryResult,
} from './payment-gateway.interface';

/**
 * Deterministic in-memory provider for dev/test (`DOKU_STUB=true`): no network
 * call, stable VA generated from the invoice id so retries stay idempotent.
 */
@Injectable()
export class StubVaProvider implements PaymentGateway {
  createVa(params: CreateVaParams): Promise<CreateVaResult> {
    return Promise.resolve({
      vaNumber: `88${this.hash(params.externalId)}`,
      bankCode: DEFAULT_VA_BANK_CODE,
      trxId: params.externalId,
      referenceNo: null,
    });
  }

  inquiryVa(params: VaInquiryParams): Promise<VaInquiryResult> {
    return Promise.resolve({
      vaNumber: params.vaNumber,
      status: 'PENDING',
      paidAmount: null,
    });
  }

  private hash(input: string): string {
    let h = 0;
    for (const ch of input) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h.toString().padStart(10, '0').slice(-14);
  }
}
