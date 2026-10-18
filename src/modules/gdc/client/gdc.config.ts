/** Shape of the `app.gdc` config namespace (see `src/config/app.config.ts`). */
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
