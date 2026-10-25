import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JokulClient } from '../client/jokul.client';
import { JokulApiError } from '../errors/jokul-api.error';
import type { JokulConfig } from '../client/jokul.config';
import { isoTimestamp } from '../utils/timestamp';
import { customerNoFromExternalId } from '../utils/customer-no';
import { DEFAULT_VA_BANK_CODE, VA_TRX_TYPE } from '../constants/jokul';
import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentGateway,
  PaymentStatusResult,
} from '../../payments/gateway/payment-gateway.interface';

/** `PaymentGateway` backed by the real Jokul SNAP client. */
@Injectable()
export class JokulVaProvider implements PaymentGateway {
  constructor(
    private readonly jokul: JokulClient,
    private readonly config: ConfigService,
  ) {}

  private get cfg(): JokulConfig {
    return this.config.get<JokulConfig>('app.jokul')!;
  }

  /**
   * Legacy VA adapter: Jokul has no hosted payment page, so token and
   * redirectUrl stay empty and the VA number travels in the result.
   * Exists only so PAYMENT_PROVIDER=jokul remains a working rollback path.
   */
  async createPayment(
    params: CreatePaymentParams,
  ): Promise<CreatePaymentResult> {
    const va = await this.createVa(params);
    return {
      providerOrderId: params.externalId,
      token: '',
      redirectUrl: '',
      transactionId: va.trxId,
      vaNumber: va.vaNumber,
      bankCode: va.bankCode,
    };
  }

  async getStatus(params: {
    providerOrderId: string;
    vaNumber?: string | null;
  }): Promise<PaymentStatusResult> {
    if (!params.vaNumber) {
      throw new JokulApiError(
        'request_failed',
        'vaNumber is required for a Jokul inquiry',
      );
    }
    const inquiry = await this.inquiryVa({
      vaNumber: params.vaNumber,
      paymentRequestId: params.providerOrderId,
      externalId: params.providerOrderId,
    });
    return {
      providerOrderId: params.providerOrderId,
      status: inquiry.status === '00' ? 'PAID' : 'PENDING',
      paidAmount: inquiry.paidAmount,
      paymentType: null,
    };
  }

  private async createVa(params: CreatePaymentParams): Promise<{
    vaNumber: string;
    bankCode: string;
    trxId: string;
    referenceNo: string | null;
  }> {
    const { partnerServiceId, bankCode, channelId } = this.cfg;
    if (!partnerServiceId) {
      throw new JokulApiError(
        'request_failed',
        'JOKUL_PARTNER_SERVICE_ID is not configured',
      );
    }
    const name = params.customer?.name ?? params.externalId;
    const customerNo = customerNoFromExternalId(params.externalId);
    const virtualAccountNo = `${partnerServiceId.padStart(8, '0')}${customerNo}`;
    const result = await this.jokul.createVirtualAccount(
      {
        partnerServiceId,
        customerNo,
        virtualAccountNo,
        virtualAccountName: name.slice(0, 255),
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

  private async inquiryVa(params: {
    vaNumber: string;
    paymentRequestId?: string;
    externalId?: string;
  }): Promise<{ vaNumber: string; status: string; paidAmount: number | null }> {
    const { channelId } = this.cfg;
    const partnerServiceId = params.vaNumber.slice(0, 8);
    const customerNo = params.vaNumber.slice(8);
    const data = await this.jokul.inquiryVa(
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
