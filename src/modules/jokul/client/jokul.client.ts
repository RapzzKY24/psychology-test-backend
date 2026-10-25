import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isoTimestamp } from '../utils/timestamp';
import { signTransaction } from '../utils/signature-transaction';
import {
  CreateVirtualAccountResponseSchema,
  VaInquiryResponseSchema,
} from '../dto/jokul.dto';
import type {
  CreateVirtualAccountInput,
  InquiryVaInput,
} from '../dto/jokul.dto';
import { JokulApiError } from '../errors/jokul-api.error';
import { JokulTokenProvider } from './jokul-token.provider';
import {
  JOKUL_PATH_CREATE_VA,
  JOKUL_PATH_VA_INQUIRY,
} from '../constants/jokul';
import type { JokulConfig } from './jokul.config';

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
export class JokulClient {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: JokulTokenProvider,
  ) {}

  private get cfg(): JokulConfig {
    return this.config.get<JokulConfig>('app.jokul')!;
  }

  /** HMAC-signed POST. `externalId` is caller-supplied so retries reuse it. */
  private async signedPost(
    path: string,
    body: unknown,
    externalId: string,
  ): Promise<unknown> {
    const { baseUrl, clientId, channelId, secretKey } = this.cfg;
    if (!baseUrl || !clientId || !secretKey) {
      throw new JokulApiError(
        'request_failed',
        'Jokul credentials are not configured',
        undefined,
        path,
      );
    }
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
      throw new JokulApiError(
        'request_failed',
        `Jokul request failed: ${path}`,
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
      await this.signedPost(JOKUL_PATH_CREATE_VA, input, externalId),
    );
    if (!result.success) {
      throw new JokulApiError(
        'request_failed',
        'Unexpected Jokul create-va response',
        undefined,
        JOKUL_PATH_CREATE_VA,
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
      await this.signedPost(JOKUL_PATH_VA_INQUIRY, input, externalId),
    );
    if (!result.success) {
      throw new JokulApiError(
        'request_failed',
        'Unexpected Jokul va-inquiry response',
        undefined,
        JOKUL_PATH_VA_INQUIRY,
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
