/** Doku's two hosts. Sandbox is the default; production needs an explicit opt-in. */
export const DOKU_BASE_URL = {
  sandbox: 'https://api-sandbox.doku.com',
  production: 'https://api.doku.com',
} as const;

/**
 * Request-Target values. Each one is a line of the signature component, so it
 * must match the path actually called — character for character.
 */
export const DOKU_CREATE_PAYMENT_TARGET = '/checkout/v1/payment';
export const DOKU_CHECK_STATUS_TARGET = '/orders/v1/status';

/** Sandbox occasionally takes >10s; give it room before aborting ourselves. */
export const DOKU_TIMEOUT_MS = 30_000;

/**
 * Connection-phase failures only: the request never reached Doku, so retrying
 * the same invoice cannot create a duplicate payment.
 */
export const DOKU_CONNECT_ERROR_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ECONNRESET',
  'ETIMEDOUT',
]);

/** Doku only needs a 2xx; the body is informational. */
export const DOKU_ACK = { message: 'OK' } as const;
