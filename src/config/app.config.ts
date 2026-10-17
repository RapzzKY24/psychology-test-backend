import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  paymentTtlMin: parseInt(process.env.PAYMENT_TTL_MIN ?? '60', 10),
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  paymentProvider: process.env.PAYMENT_PROVIDER ?? 'manual',
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
