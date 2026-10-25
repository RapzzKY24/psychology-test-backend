/** Shape of the `app.midtrans` config namespace. */
export interface MidtransConfig {
  stub: boolean;
  isProduction: boolean;
  serverKey: string;
  clientKey: string;
  finishUrl: string;
}

const MIDTRANS_SANDBOX_API_URL = 'https://api.sandbox.midtrans.com';
const MIDTRANS_SANDBOX_SNAP_URL = 'https://app.sandbox.midtrans.com';
const MIDTRANS_PRODUCTION_API_URL = 'https://api.midtrans.com';
const MIDTRANS_PRODUCTION_SNAP_URL = 'https://app.midtrans.com';

/** Core API host: transaction status lookups (`/v2/{order_id}/status`). */
export function midtransApiBaseUrl(cfg: MidtransConfig): string {
  return cfg.isProduction
    ? MIDTRANS_PRODUCTION_API_URL
    : MIDTRANS_SANDBOX_API_URL;
}

/** Snap host: Snap transaction creation (`/snap/v1/transactions`). */
export function midtransSnapBaseUrl(cfg: MidtransConfig): string {
  return cfg.isProduction
    ? MIDTRANS_PRODUCTION_SNAP_URL
    : MIDTRANS_SANDBOX_SNAP_URL;
}
