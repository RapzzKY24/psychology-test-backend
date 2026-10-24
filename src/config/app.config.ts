import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  paymentTtlMin: parseInt(process.env.PAYMENT_TTL_MIN ?? '60', 10),
  sessionDefaultTtlDays: parseInt(
    process.env.SESSION_DEFAULT_TTL_DAYS ?? '30',
    10,
  ),
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  paymentProvider: process.env.PAYMENT_PROVIDER ?? 'doku',
  recovery: {
    intervalMin: parseInt(process.env.PAYMENT_RECOVERY_INTERVAL_MIN ?? '5', 10),
    staleAfterMin: parseInt(process.env.PAYMENT_RECOVERY_STALE_MIN ?? '5', 10),
    lookbackMin: parseInt(
      process.env.PAYMENT_RECOVERY_LOOKBACK_MIN ?? '1440',
      10,
    ),
    batchSize: parseInt(process.env.PAYMENT_RECOVERY_BATCH ?? '50', 10),
  },
  doku: {
    stub: process.env.DOKU_STUB === 'true',
    baseUrl: process.env.DOKU_BASE_URL ?? '',
    clientId: process.env.DOKU_CLIENT_ID ?? '',
    privateKey: (process.env.DOKU_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    secretKey: process.env.DOKU_SECRET_KEY ?? '',
    partnerServiceId: process.env.DOKU_PARTNER_SERVICE_ID ?? '',
    channelId: process.env.DOKU_CHANNEL_ID ?? 'H2H',
    bankCode: process.env.DOKU_BANK_CODE ?? 'DOKU',
    callbackUrl: process.env.DOKU_CALLBACK_URL ?? '',
  },
}));
