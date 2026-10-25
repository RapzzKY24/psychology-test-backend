import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  paymentTtlMin: parseInt(process.env.PAYMENT_TTL_MIN ?? '60', 10),
  sessionDefaultTtlDays: parseInt(
    process.env.SESSION_DEFAULT_TTL_DAYS ?? '30',
    10,
  ),
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  // Stays 'jokul' until the cutover task flips it; 'midtrans' is not wired yet.
  paymentProvider: process.env.PAYMENT_PROVIDER ?? 'jokul',
  recovery: {
    intervalMin: parseInt(process.env.PAYMENT_RECOVERY_INTERVAL_MIN ?? '5', 10),
    staleAfterMin: parseInt(process.env.PAYMENT_RECOVERY_STALE_MIN ?? '5', 10),
    lookbackMin: parseInt(
      process.env.PAYMENT_RECOVERY_LOOKBACK_MIN ?? '1440',
      10,
    ),
    batchSize: parseInt(process.env.PAYMENT_RECOVERY_BATCH ?? '50', 10),
  },
  jokul: {
    stub: process.env.JOKUL_STUB === 'true',
    baseUrl: process.env.JOKUL_BASE_URL ?? '',
    clientId: process.env.JOKUL_CLIENT_ID ?? '',
    privateKey: (process.env.JOKUL_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    secretKey: process.env.JOKUL_SECRET_KEY ?? '',
    partnerServiceId: process.env.JOKUL_PARTNER_SERVICE_ID ?? '',
    channelId: process.env.JOKUL_CHANNEL_ID ?? 'H2H',
    bankCode: process.env.JOKUL_BANK_CODE ?? 'JOKUL',
    callbackUrl: process.env.JOKUL_CALLBACK_URL ?? '',
  },
  midtrans: {
    stub: process.env.MIDTRANS_STUB === 'true',
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? '',
    clientKey: process.env.MIDTRANS_CLIENT_KEY ?? '',
    finishUrl: process.env.MIDTRANS_FINISH_URL ?? '',
  },
}));
