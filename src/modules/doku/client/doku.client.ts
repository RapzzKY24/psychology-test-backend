import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isoTimestamp } from '../utils/timestamp';
import { signTransaction } from '../utils/signature-transaction';
import {
  CreateVirtualAccountResponseSchema,
  VaInquiryResponseSchema,
} from '../dto/doku.dto';
import type {
  CreateVirtualAccountInput,
  InquiryVaInput,
} from '../dto/doku.dto';
import { DokuApiError } from '../errors/doku-api.error';
import { DokuTokenProvider } from './doku-token.provider';
import { DOKU_PATH_CREATE_VA, DOKU_PATH_VA_INQUIRY } from '../constants/doku';
import type { DokuConfig } from './doku.config';

export interface CreateVirtualAccountResult {
  virtualAccountNo: string;
  trxId: string;
  referenceNo: string | null;
}

export interface InquiryVaResult {
  virtualAccountNo: string;
  paymentFlagStatus: string | null;
  paidAmount: number | null;
}

@Injectable()
export class DokuClient {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: DokuTokenProvider,
  ) {}

  private get cfg(): DokuConfig {
    return this.config.get<DokuConfig>('app.doku')!;
  }

  /** HMAC-signed POST. `externalId` is caller-supplied so retries reuse it. */
  private async signedPost(
    path: string,
    body: unknown,
    externalId: string,
  ): Promise<unknown> {
    const { baseUrl, clientId, channelId, secretKey } = this.cfg;
    const token = await this.tokens.getAccessToken();
    const payload = JSON.stringify(body);
    const timestamp = isoTimestamp();
    const signature = signTransaction({
      method: 'POST',
      path,
      tokenB2B: token,
      payload,
      timestamp,
      clientSecret: secretKey,
    });
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-TIMESTAMP': timestamp,
        'X-PARTNER-ID': clientId,
        'X-EXTERNAL-ID': externalId,
        'CHANNEL-ID': channelId,
        'X-SIGNATURE': signature,
      },
      body: payload,
    });
    if (!response.ok) {
      throw new DokuApiError(
        'request_failed',
        `Doku request failed: ${path}`,
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
    const result = CreateVirtualAccountResponseSchema.safeParse(
      await this.signedPost(DOKU_PATH_CREATE_VA, input, externalId),
    );
    if (!result.success) {
      throw new DokuApiError(
        'request_failed',
        'Unexpected Doku create-va response',
        undefined,
        DOKU_PATH_CREATE_VA,
      );
    }
    const { virtualAccountData } = result.data;
    return {
      virtualAccountNo: virtualAccountData.virtualAccountNo,
      trxId: virtualAccountData.trxId,
      referenceNo: virtualAccountData.additionalInfo?.referenceNo ?? null,
    };
  }

  async inquiryVa(
    input: InquiryVaInput,
    externalId: string,
  ): Promise<InquiryVaResult> {
    const result = VaInquiryResponseSchema.safeParse(
      await this.signedPost(DOKU_PATH_VA_INQUIRY, input, externalId),
    );
    if (!result.success) {
      throw new DokuApiError(
        'request_failed',
        'Unexpected Doku va-inquiry response',
        undefined,
        DOKU_PATH_VA_INQUIRY,
      );
    }
    const data = result.data.virtualAccountData;
    return {
      virtualAccountNo: data?.virtualAccountNo ?? input.virtualAccountNo,
      paymentFlagStatus: data?.paymentFlagStatus ?? null,
      paidAmount: data?.paidAmount
        ? Number(data.paidAmount.value)
        : data?.totalAmount
          ? Number(data.totalAmount.value)
          : null,
    };
  }
}
