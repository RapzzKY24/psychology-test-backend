import type { PaymentProvider } from '../../generated/prisma/client';

/**
 * Values accepted by the `PAYMENT_PROVIDER` env var (Task 2.1).
 * Accepts manual | midtrans | jokul; jokul is kept for rollback only.
 */
export type PaymentProviderEnv = 'manual' | 'midtrans' | 'jokul';

/** Maps the env vocabulary onto the `PaymentProvider` DB enum. */
export const PAYMENT_PROVIDER_ENV_TO_DB: Record<
  PaymentProviderEnv,
  PaymentProvider
> = {
  manual: 'MANUAL_QRIS',
  midtrans: 'MIDTRANS_SNAP',
  jokul: 'JOKUL_VA',
};
