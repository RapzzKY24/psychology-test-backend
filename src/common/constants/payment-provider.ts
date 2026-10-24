import type { PaymentProvider } from '../../generated/prisma/client';

/** Values accepted by the `PAYMENT_PROVIDER` env var (Task 2.1). */
export type PaymentProviderEnv = 'manual' | 'doku';

/** Maps the env vocabulary onto the `PaymentProvider` DB enum. */
export const PAYMENT_PROVIDER_ENV_TO_DB: Record<
  PaymentProviderEnv,
  PaymentProvider
> = {
  manual: 'MANUAL_QRIS',
  doku: 'DOKU_VA',
};
