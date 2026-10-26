import type { PaymentProvider } from '../../generated/prisma/client';

/**
 * Values accepted by the `PAYMENT_PROVIDER` env var.
 *
 * `jokul` is retired; the `JOKUL_VA` DB enum value is kept so historical rows
 * stay readable. Anything other than `manual` resolves to Midtrans.
 */
export type PaymentProviderEnv = 'manual' | 'midtrans';

/** Maps the env vocabulary onto the `PaymentProvider` DB enum. */
export const PAYMENT_PROVIDER_ENV_TO_DB: Record<
  PaymentProviderEnv,
  PaymentProvider
> = {
  manual: 'MANUAL_QRIS',
  midtrans: 'MIDTRANS_SNAP',
};
