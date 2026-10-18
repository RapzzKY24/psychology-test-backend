import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isoTimestamp } from '../utils/timestamp';
import { signAccessToken } from '../utils/signature-access-token';
import { AccessTokenResponseSchema } from '../dto/gdc.dto';
import { GdcApiError } from '../errors/gdc-api.error';
import {
  GDC_PATH_ACCESS_TOKEN,
  GDC_TOKEN_DEFAULT_TTL_SECONDS,
  GDC_TOKEN_EXPIRY_SAFETY_MS,
} from '../constants/gdc';
import type { GdcConfig } from './gdc.config';

/** Obtains and caches the SNAP B2B access token (RSA-signed). */
@Injectable()
export class GdcTokenProvider {
  private cached: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  private get cfg(): GdcConfig {
    return this.config.get<GdcConfig>('app.gdc')!;
  }

  async getAccessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt > Date.now()) {
      return this.cached.value;
    }
    const { baseUrl, clientId, privateKey } = this.cfg;
    const timestamp = isoTimestamp();
    const signature = signAccessToken(clientId, timestamp, privateKey);
    const response = await fetch(`${baseUrl}${GDC_PATH_ACCESS_TOKEN}`, {
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
      throw new GdcApiError(
        'access_token_failed',
        'Failed to obtain GDC access token',
        response.status,
        GDC_PATH_ACCESS_TOKEN,
      );
    }
    const result = AccessTokenResponseSchema.safeParse(await response.json());
    if (!result.success) {
      throw new GdcApiError(
        'access_token_failed',
        'Unexpected GDC access-token response',
        response.status,
        GDC_PATH_ACCESS_TOKEN,
      );
    }
    const parsed = result.data;
    const ttlSeconds =
      parseInt(parsed.expiresIn, 10) || GDC_TOKEN_DEFAULT_TTL_SECONDS;
    this.cached = {
      value: parsed.accessToken,
      expiresAt: Date.now() + ttlSeconds * 1000 - GDC_TOKEN_EXPIRY_SAFETY_MS,
    };
    return parsed.accessToken;
  }
}
