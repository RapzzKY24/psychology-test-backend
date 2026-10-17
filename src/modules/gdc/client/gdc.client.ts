import { randomUUID } from 'node:crypto';
import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isoTimestamp } from '../utils/timestamp';
import { signAccessToken } from '../utils/signature-access-token';
import { signTransaction } from '../utils/signature-transaction';
import {
  AccessTokenResponseSchema,
  CreateVirtualAccountResponseSchema,
  VaStatusResponseSchema,
} from '../dto/gdc.dto';
import type {
  CreateVirtualAccountInput,
  InquiryVaStatusInput,
  VaStatusResponse,
} from '../dto/gdc.dto';

export interface GdcConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  partnerId: string;
  channelId: string;
  accountNumber: string;
  callbackUrl: string;
}

export interface CreateVirtualAccountResult {
  virtualAccountNo: string;
  trxId: string;
  referenceNo: string | null;
}

@Injectable()
export class GdcClient {
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  private get cfg(): GdcConfig {
    return this.config.get<GdcConfig>('app.gdc')!;
  }

  /** Obtain (and cache) a B2B access token via the RSA-signed token endpoint. */
  async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.value;
    }
    const { baseUrl, clientId, privateKey } = this.cfg;
    const timestamp = isoTimestamp();
    const signature = signAccessToken(clientId, timestamp, privateKey);
    const response = await fetch(`${baseUrl}/v1.0/access-token/b2b`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Timestamp': timestamp,
        'Client-Key': clientId,
        'X-Signature': signature,
      },
      body: JSON.stringify({ grantType: 'client_credentials' }),
    });
    if (!response.ok) {
      throw new BadGatewayException({
        message: 'gdc_access_token_failed',
        details: [`http ${response.status}`],
      });
    }
    const parsed = AccessTokenResponseSchema.parse(await response.json());
    const ttlMs = (parseInt(parsed.expiresIn, 10) || 900) * 1000;
    this.cachedToken = {
      value: parsed.accessToken,
      expiresAt: Date.now() + ttlMs - 60_000,
    };
    return parsed.accessToken;
  }

  private async signedPost(
    path: string,
    body: unknown,
    externalId: string,
  ): Promise<unknown> {
    const { baseUrl, partnerId, channelId, clientSecret } = this.cfg;
    const token = await this.getAccessToken();
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
      throw new BadGatewayException({
        message: 'gdc_request_failed',
        details: [`${path} http ${response.status}`],
      });
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
    const parsed = CreateVirtualAccountResponseSchema.parse(
      await this.signedPost('/v1.0/transfer-va/create-va', body, externalId),
    );
    return {
      virtualAccountNo: parsed.virtualAccountData.virtualAccountNo,
      trxId: parsed.virtualAccountData.trxId,
      referenceNo:
        parsed.virtualAccountData.additionalInfo?.referenceNo ?? null,
    };
  }

  async inquiryVaStatus(
    input: InquiryVaStatusInput,
  ): Promise<VaStatusResponse['virtualAccountData']> {
    const body = {
      virtualAccountNo: input.virtualAccountNo,
      paymentRequestId: input.paymentRequestId,
      inquiryRequestId: '',
    };
    const parsed = VaStatusResponseSchema.parse(
      await this.signedPost('/v1.0/transfer-va/status', body, randomUUID()),
    );
    return parsed.virtualAccountData;
  }
}
