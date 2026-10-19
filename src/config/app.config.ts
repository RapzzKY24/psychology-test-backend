import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  paymentTtlMin: parseInt(process.env.PAYMENT_TTL_MIN ?? '60', 10),
  sessionDefaultTtlDays: parseInt(
    process.env.SESSION_DEFAULT_TTL_DAYS ?? '30',
    10,
  ),
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  paymentProvider: process.env.PAYMENT_PROVIDER ?? 'manual',
  gdcStub: process.env.GDC_STUB === 'true',
  recovery: {
    intervalMin: parseInt(process.env.PAYMENT_RECOVERY_INTERVAL_MIN ?? '5', 10),
    staleAfterMin: parseInt(process.env.PAYMENT_RECOVERY_STALE_MIN ?? '5', 10),
    lookbackMin: parseInt(
      process.env.PAYMENT_RECOVERY_LOOKBACK_MIN ?? '1440',
      10,
    ),
    batchSize: parseInt(process.env.PAYMENT_RECOVERY_BATCH ?? '50', 10),
  },
  gdc: {
    baseUrl: process.env.GDC_BASE_URL ?? '',
    clientId: process.env.GDC_CLIENT_ID ?? '',
    clientSecret: process.env.GDC_CLIENT_SECRET ?? '',
    privateKey: (process.env.GDC_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    partnerId: process.env.GDC_PARTNER_ID ?? '',
    channelId: process.env.GDC_CHANNEL_ID ?? '',
    accountNumber: process.env.GDC_ACCOUNT_NUMBER ?? '',
    callbackUrl: process.env.GDC_CALLBACK_URL ?? '',
  },
}));
