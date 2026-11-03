import type {
  EventSource,
  PaymentProvider,
  PaymentVerifiedBySource,
} from '../../generated/prisma/client';

/**
 * Values accepted by the `PAYMENT_PROVIDER` env var.
 *
 * `jokul` is retired; the `JOKUL_VA` DB enum value is kept so historical rows
 * stay readable. Anything unknown resolves to `midtrans`, so a typo in the env
 * can never silently disable payments.
 */
export type PaymentProviderEnv = 'manual' | 'midtrans' | 'doku';

/** Maps the env vocabulary onto the `PaymentProvider` DB enum. */
export const PAYMENT_PROVIDER_ENV_TO_DB: Record<
  PaymentProviderEnv,
  PaymentProvider
> = {
  manual: 'MANUAL_QRIS',
  midtrans: 'MIDTRANS_SNAP',
  doku: 'DOKU_CHECKOUT',
};

/** Maps the env vocabulary onto the `EventSource` audit enum. */
const EVENT_SOURCE_BY_ENV: Record<PaymentProviderEnv, EventSource> = {
  manual: 'MANUAL',
  midtrans: 'MIDTRANS',
  doku: 'DOKU',
};

/**
 * Normalises a raw env value. An unknown or non-string value falls back to
 * `midtrans` instead of leaking into idempotency scopes and DB columns.
 *
 * Every provider decision goes through here: a second provider is only cheap
 * while this is the single place that knows the vocabulary.
 */
export function resolveProviderEnv(
  raw: string | undefined,
): PaymentProviderEnv {
  return raw === 'manual' || raw === 'doku' ? raw : 'midtrans';
}

/** The audit source for the provider that actually served a request. */
export function toEventSource(env: PaymentProviderEnv): EventSource {
  return EVENT_SOURCE_BY_ENV[env];
}

/**
 * Who settled the payment. A manual transfer has no provider to name, and the
 * only thing that ever clears it is an admin, so `manual` maps to `ADMIN`
 * rather than inventing an enum value.
 */
const VERIFIED_BY_SOURCE_BY_ENV: Record<
  PaymentProviderEnv,
  PaymentVerifiedBySource
> = {
  manual: 'ADMIN',
  midtrans: 'MIDTRANS',
  doku: 'DOKU',
};

/** The `verifiedBySource` value for the active provider. */
export function toVerifiedBySource(
  env: PaymentProviderEnv,
): PaymentVerifiedBySource {
  return VERIFIED_BY_SOURCE_BY_ENV[env];
}

/**
 * Who settled a payment that arrived as a notification.
 *
 * Reads the *sender*, not the active provider: during a switch both transports
 * stay live, so a Snap callback must not be recorded as Doku just because Doku
 * is the default now — the audit trail has to name the provider that actually
 * settled the money.
 */
const VERIFIED_BY_SOURCE_BY_EVENT: Record<
  EventSource,
  PaymentVerifiedBySource
> = {
  MANUAL: 'ADMIN',
  JOKUL: 'JOKUL',
  MIDTRANS: 'MIDTRANS',
  DOKU: 'DOKU',
};

export function toVerifiedBySourceFromEvent(
  source: EventSource,
): PaymentVerifiedBySource {
  return VERIFIED_BY_SOURCE_BY_EVENT[source];
}
