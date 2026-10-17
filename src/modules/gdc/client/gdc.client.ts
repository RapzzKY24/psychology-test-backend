import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isoTimestamp } from '../utils/timestamp';
import { signTransaction } from '../utils/signature-transaction';
import {
  CreateVirtualAccountResponseSchema,
  VaStatusResponseSchema,
} from '../dto/gdc.dto';
import type {
  CreateVirtualAccountInput,
  InquiryVaStatusInput,
  VaStatusResponse,
} from '../dto/gdc.dto';
import { GdcApiError } from '../errors/gdc-api.error';
import { GdcTokenProvider } from './gdc-token.provider';
import { GDC_PATH_CREATE_VA, GDC_PATH_VA_STATUS } from '../constants/gdc';
import type { GdcConfig } from './gdc.config';

export interface CreateVirtualAccountResult {
  virtualAccountNo: string;
  trxId: string;
  referenceNo: string | null;
}

@Injectable()
export class GdcClient {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: GdcTokenProvider,
  ) {}

  private get cfg(): GdcConfig {
    return this.config.get<GdcConfig>('app.gdc')!;
  }

  /** HMAC-signed POST. `externalId` is caller-supplied so retries reuse it. */
  private async signedPost(
    path: string,
    body: unknown,
    externalId: string,
  ): Promise<unknown> {
    const { baseUrl, partnerId, channelId, clientSecret } = this.cfg;
    const token = await this.tokens.getAccessToken();
    const payload = JSON.stringify(body);
    const timestamp = isoTimestamp();
    const signature = signTransaction({
      method: 'POST',
      path,
      tokenB2B: token,
      payload,
      timestamp,
      clientSecret,
    });
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-TIMESTAMP': timestamp,
        'X-PARTNER-ID': partnerId,
        'X-EXTERNAL-ID': externalId,
        'CHANNEL-ID': channelId,
        'X-Signature': signature,
      },
      body: payload,
    });
    if (!response.ok) {
      throw new GdcApiError(
        'request_failed',
        `GDC request failed: ${path}`,
        response.status,
        path,
      );
    }
    return response.json();
  }

  async createVirtualAccount(
    input: CreateVirtualAccountInput,
    externalId: string,
  ): Promise<CreateVirtualAccountResult> {
    const body = {
      virtualAccountName: input.virtualAccountName,
      expiredDate: input.expiredDate,
      trxId: input.trxId,
      virtualAccountTrxType: input.virtualAccountTrxType,
      totalAmount: input.totalAmount,
      additionalInfo: {
        accountNumber: input.accountNumber,
        bankCode: input.bankCode,
      },
    };
    const result = CreateVirtualAccountResponseSchema.safeParse(
      await this.signedPost(GDC_PATH_CREATE_VA, body, externalId),
    );
    if (!result.success) {
      throw new GdcApiError(
        'request_failed',
        'Unexpected GDC create-va response',
        undefined,
        GDC_PATH_CREATE_VA,
      );
    }
    const { virtualAccountData } = result.data;
    return {
      virtualAccountNo: virtualAccountData.virtualAccountNo,
      trxId: virtualAccountData.trxId,
      referenceNo: virtualAccountData.additionalInfo?.referenceNo ?? null,
    };
  }

  async inquiryVaStatus(
    input: InquiryVaStatusInput,
    externalId: string,
  ): Promise<VaStatusResponse['virtualAccountData']> {
    const body = {
      virtualAccountNo: input.virtualAccountNo,
      paymentRequestId: input.paymentRequestId,
      inquiryRequestId: '',
    };
    const result = VaStatusResponseSchema.safeParse(
      await this.signedPost(GDC_PATH_VA_STATUS, body, externalId),
    );
    if (!result.success) {
      throw new GdcApiError(
        'request_failed',
        'Unexpected GDC va-status response',
        undefined,
        GDC_PATH_VA_STATUS,
      );
    }
    return result.data.virtualAccountData;
  }
}
