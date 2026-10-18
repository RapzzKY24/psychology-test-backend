import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GdcClient } from '../client/gdc.client';
import { isoTimestamp } from '../utils/timestamp';
import { DEFAULT_VA_BANK_CODE, VA_TRX_TYPE } from '../constants/gdc';
import type {
  CreateVaParams,
  CreateVaResult,
  PaymentGateway,
  VaInquiryParams,
  VaInquiryResult,
} from './payment-gateway.interface';

/** `PaymentGateway` backed by the real GDC SNAP client. */
@Injectable()
export class GdcVaProvider implements PaymentGateway {
  constructor(
    private readonly gdc: GdcClient,
    private readonly config: ConfigService,
  ) {}

  async createVa(params: CreateVaParams): Promise<CreateVaResult> {
    const result = await this.gdc.createVirtualAccount(
      {
        virtualAccountName: params.name,
        expiredDate: isoTimestamp(params.expiresAt),
        trxId: params.externalId,
        virtualAccountTrxType: VA_TRX_TYPE,
        totalAmount: { value: params.amount.toFixed(2), currency: 'IDR' },
        accountNumber: this.config.get<string>('app.gdc.accountNumber', ''),
        bankCode: DEFAULT_VA_BANK_CODE,
      },
      params.externalId,
    );
    return {
      vaNumber: result.virtualAccountNo,
      bankCode: DEFAULT_VA_BANK_CODE,
      trxId: result.trxId,
      referenceNo: result.referenceNo,
    };
  }

  async inquiryVa(params: VaInquiryParams): Promise<VaInquiryResult> {
    const data = await this.gdc.inquiryVaStatus(
      {
        virtualAccountNo: params.vaNumber,
        paymentRequestId: params.paymentRequestId ?? params.vaNumber,
      },
      params.externalId ?? params.vaNumber,
    );
    return {
      vaNumber: params.vaNumber,
      status: data.paymentFlagStatus ?? 'PENDING',
      paidAmount: data.totalAmount ? Number(data.totalAmount.value) : null,
    };
  }
}
