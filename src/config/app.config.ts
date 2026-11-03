import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  paymentTtlMin: parseInt(process.env.PAYMENT_TTL_MIN ?? '60', 10),
  sessionDefaultTtlDays: parseInt(
    process.env.SESSION_DEFAULT_TTL_DAYS ?? '30',
    10,
  ),
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  // Basis URL untuk QR verifikasi di PDF invoice. Wajib diisi: QR yang menunjuk
  // ke path relatif tidak bisa dipindai dari kertas.
  publicUrl: process.env.APP_PUBLIC_URL ?? '',
  invoiceLogoPath:
    process.env.INVOICE_LOGO_PATH ?? './assets/invoice/logo.jpeg',
  // Which transport is bound; 'manual' disables payments entirely.
  paymentProvider: process.env.PAYMENT_PROVIDER ?? 'midtrans',
  recovery: {
    intervalMin: parseInt(process.env.PAYMENT_RECOVERY_INTERVAL_MIN ?? '5', 10),
    staleAfterMin: parseInt(process.env.PAYMENT_RECOVERY_STALE_MIN ?? '5', 10),
    lookbackMin: parseInt(
      process.env.PAYMENT_RECOVERY_LOOKBACK_MIN ?? '1440',
      10,
    ),
    batchSize: parseInt(process.env.PAYMENT_RECOVERY_BATCH ?? '50', 10),
  },
  midtrans: {
    stub: process.env.MIDTRANS_STUB === 'true',
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? '',
    clientKey: process.env.MIDTRANS_CLIENT_KEY ?? '',
    finishUrl: process.env.MIDTRANS_FINISH_URL ?? '',
  },
  doku: {
    stub: process.env.DOKU_STUB === 'true',
    isProduction: process.env.DOKU_IS_PRODUCTION === 'true',
    clientId: process.env.DOKU_CLIENT_ID ?? '',
    secretKey: process.env.DOKU_SECRET_KEY ?? '',
    // Must equal the Notification URL registered in the Doku dashboard: it is
    // part of the signature component, so a rewrite by a proxy breaks it.
    notificationPath:
      process.env.DOKU_NOTIFICATION_PATH ??
      '/api/v1/webhooks/doku/notification',
    // Where Doku sends the buyer back; the reference id is appended.
    resultUrlBase: process.env.DOKU_RESULT_URL_BASE ?? '',
  },
}));
