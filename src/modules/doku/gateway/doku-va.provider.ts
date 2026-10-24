import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DokuClient } from '../client/doku.client';
import type { DokuConfig } from '../client/doku.config';
import { isoTimestamp } from '../utils/timestamp';
import { customerNoFromExternalId } from '../utils/customer-no';
import { DEFAULT_VA_BANK_CODE, VA_TRX_TYPE } from '../constants/doku';
import type {
  CreateVaParams,
  CreateVaResult,
  PaymentGateway,
  VaInquiryParams,
  VaInquiryResult,
} from './payment-gateway.interface';

/** `PaymentGateway` backed by the real Doku SNAP client. */
@Injectable()
export class DokuVaProvider implements PaymentGateway {
  constructor(
    private readonly doku: DokuClient,
    private readonly config: ConfigService,
  ) {}

  private get cfg(): DokuConfig {
    return this.config.get<DokuConfig>('app.doku')!;
  }

  async createVa(params: CreateVaParams): Promise<CreateVaResult> {
    const { partnerServiceId, bankCode, channelId } = this.cfg;
    const customerNo = customerNoFromExternalId(params.externalId);
    const virtualAccountNo = `${partnerServiceId.padStart(8, '0')}${customerNo}`;
    const result = await this.doku.createVirtualAccount(
      {
        partnerServiceId,
        customerNo,
        virtualAccountNo,
        virtualAccountName: params.name.slice(0, 255),
        trxId: params.externalId,
        virtualAccountTrxType: VA_TRX_TYPE,
        totalAmount: { value: params.amount.toFixed(2), currency: 'IDR' },
        expiredDate: isoTimestamp(params.expiresAt),
        virtualAccountConfig: { reusableStatus: false },
        additionalInfo: { channel: channelId },
      },
      params.externalId,
    );
    return {
      vaNumber: result.virtualAccountNo,
      bankCode: bankCode || DEFAULT_VA_BANK_CODE,
      trxId: result.trxId,
      referenceNo: result.referenceNo,
    };
  }

  async inquiryVa(params: VaInquiryParams): Promise<VaInquiryResult> {
    const { channelId } = this.cfg;
    const partnerServiceId = params.vaNumber.slice(0, 8);
    const customerNo = params.vaNumber.slice(8);
    const data = await this.doku.inquiryVa(
      {
        partnerServiceId,
        customerNo,
        virtualAccountNo: params.vaNumber,
        inquiryRequestId: params.paymentRequestId ?? params.vaNumber,
        trxDateInit: isoTimestamp(),
        language: 'ID',
        additionalInfo: { channel: channelId },
      },
      params.externalId ?? params.vaNumber,
    );
    return {
      vaNumber: params.vaNumber,
      status: data.paymentFlagStatus ?? 'PENDING',
      paidAmount: data.paidAmount,
    };
  }
}
