/** Shape of the `app.jokul` config namespace (see `src/config/app.config.ts`). */
export interface JokulConfig {
  baseUrl: string;
  clientId: string;
  privateKey: string;
  secretKey: string;
  partnerServiceId: string;
  channelId: string;
  bankCode: string;
  callbackUrl: string;
}
