import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isoTimestamp } from '../utils/timestamp';
import { signAccessToken } from '../utils/signature-access-token';
import { AccessTokenResponseSchema } from '../dto/doku.dto';
import { DokuApiError } from '../errors/doku-api.error';
import {
  DOKU_PATH_ACCESS_TOKEN,
  DOKU_TOKEN_DEFAULT_TTL_SECONDS,
  DOKU_TOKEN_EXPIRY_SAFETY_MS,
} from '../constants/doku';
import type { DokuConfig } from './doku.config';

/** Obtains and caches the SNAP B2B access token (RSA-signed). */
@Injectable()
export class DokuTokenProvider {
  private cached: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  private get cfg(): DokuConfig {
    return this.config.get<DokuConfig>('app.doku')!;
  }

  async getAccessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt > Date.now()) {
      return this.cached.value;
    }
    const { baseUrl, clientId, privateKey } = this.cfg;
    const timestamp = isoTimestamp();
    const signature = signAccessToken(clientId, timestamp, privateKey);
    const response = await fetch(`${baseUrl}${DOKU_PATH_ACCESS_TOKEN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TIMESTAMP': timestamp,
        'X-CLIENT-KEY': clientId,
        'X-SIGNATURE': signature,
      },
      body: JSON.stringify({ grantType: 'client_credentials' }),
    });
    if (!response.ok) {
      throw new DokuApiError(
        'access_token_failed',
        'Failed to obtain Doku access token',
        response.status,
        DOKU_PATH_ACCESS_TOKEN,
      );
    }
    const result = AccessTokenResponseSchema.safeParse(await response.json());
    if (!result.success) {
      throw new DokuApiError(
        'access_token_failed',
        'Unexpected Doku access-token response',
        response.status,
        DOKU_PATH_ACCESS_TOKEN,
      );
    }
    const parsed = result.data;
    const ttlSeconds =
      parseInt(parsed.expiresIn ?? '', 10) || DOKU_TOKEN_DEFAULT_TTL_SECONDS;
    this.cached = {
      value: parsed.accessToken,
      expiresAt: Date.now() + ttlSeconds * 1000 - DOKU_TOKEN_EXPIRY_SAFETY_MS,
    };
    return parsed.accessToken;
  }
}
