/** SNAP endpoint paths (appended to `DOKU_BASE_URL`). */
export const DOKU_PATH_ACCESS_TOKEN = '/authorization/v1/access-token/b2b';
export const DOKU_PATH_CREATE_VA =
  '/virtual-accounts/bi-snap-va/v1.1/transfer-va/create-va';
export const DOKU_PATH_VA_INQUIRY =
  '/virtual-accounts/bi-snap-va/v1.1/transfer-va/inquiry';

/** Access token lifetime fallback when Doku omits `expiresIn` (seconds). */
export const DOKU_TOKEN_DEFAULT_TTL_SECONDS = 900;

/** Refresh the cached token this long before it actually expires (ms). */
export const DOKU_TOKEN_EXPIRY_SAFETY_MS = 60_000;

/** Asia/Jakarta offset (minutes) used for the SNAP `+07:00` timestamp. */
export const JAKARTA_OFFSET_MINUTES = 7 * 60;

/** Label stored on order/invoice rows; the real bank comes from `partnerServiceId`. */
export const DEFAULT_VA_BANK_CODE = 'DOKU';

/** Doku create-va transaction type: closed amount. */
export const VA_TRX_TYPE = 'C';

/** Host-to-host channel id required by Doku's VA endpoints. */
export const DOKU_CHANNEL_ID = 'H2H';

/** SNAP response code Doku expects in the VA notification acknowledgement. */
export const DOKU_VA_ACK = {
  responseCode: '2002700',
  responseMessage: 'Successful',
} as const;
