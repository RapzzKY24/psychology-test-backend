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
  // Midtrans is the only gateway left; 'manual' still disables it entirely.
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
}));
