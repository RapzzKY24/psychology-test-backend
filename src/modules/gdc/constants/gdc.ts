/** SNAP endpoint paths (appended to `GDC_BASE_URL`). */
export const GDC_PATH_ACCESS_TOKEN = '/v1.0/access-token/b2b';
export const GDC_PATH_CREATE_VA = '/v1.0/transfer-va/create-va';
export const GDC_PATH_VA_STATUS = '/v1.0/transfer-va/status';

/** Access token lifetime fallback when GDC omits `expiresIn` (seconds). */
export const GDC_TOKEN_DEFAULT_TTL_SECONDS = 900;

/** Refresh the cached token this long before it actually expires (ms). */
export const GDC_TOKEN_EXPIRY_SAFETY_MS = 60_000;

/** Asia/Jakarta offset (minutes) used for the SNAP `+07:00` timestamp. */
export const JAKARTA_OFFSET_MINUTES = 7 * 60;
