import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isoTimestamp } from '../utils/timestamp';
import { signAccessToken } from '../utils/signature-access-token';
import { AccessTokenResponseSchema } from '../dto/jokul.dto';
import { JokulApiError } from '../errors/jokul-api.error';
import {
  JOKUL_PATH_ACCESS_TOKEN,
  JOKUL_TOKEN_DEFAULT_TTL_SECONDS,
  JOKUL_TOKEN_EXPIRY_SAFETY_MS,
} from '../constants/jokul';
import type { JokulConfig } from './jokul.config';

/** Obtains and caches the SNAP B2B access token (RSA-signed). */
@Injectable()
export class JokulTokenProvider {
  private cached: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  private get cfg(): JokulConfig {
    return this.config.get<JokulConfig>('app.jokul')!;
  }

  async getAccessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt > Date.now()) {
      return this.cached.value;
    }
    const { baseUrl, clientId, privateKey } = this.cfg;
    if (!baseUrl || !clientId || !privateKey) {
      throw new JokulApiError(
        'access_token_failed',
        'Jokul credentials are not configured',
        undefined,
        JOKUL_PATH_ACCESS_TOKEN,
      );
    }
    const timestamp = isoTimestamp();
    const signature = signAccessToken(clientId, timestamp, privateKey);
    const response = await fetch(`${baseUrl}${JOKUL_PATH_ACCESS_TOKEN}`, {
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
      throw new JokulApiError(
        'access_token_failed',
        'Failed to obtain Jokul access token',
        response.status,
        JOKUL_PATH_ACCESS_TOKEN,
      );
    }
    const result = AccessTokenResponseSchema.safeParse(await response.json());
    if (!result.success) {
      throw new JokulApiError(
        'access_token_failed',
        'Unexpected Jokul access-token response',
        response.status,
        JOKUL_PATH_ACCESS_TOKEN,
      );
    }
    const parsed = result.data;
    const ttlSeconds =
      parseInt(parsed.expiresIn ?? '', 10) || JOKUL_TOKEN_DEFAULT_TTL_SECONDS;
    this.cached = {
      value: parsed.accessToken,
      expiresAt: Date.now() + ttlSeconds * 1000 - JOKUL_TOKEN_EXPIRY_SAFETY_MS,
    };
    return parsed.accessToken;
  }
}
