/** Shape of the `app.doku` config namespace (see `src/config/app.config.ts`). */
export interface DokuConfig {
  baseUrl: string;
  clientId: string;
  privateKey: string;
  secretKey: string;
  partnerServiceId: string;
  channelId: string;
  bankCode: string;
  callbackUrl: string;
}
