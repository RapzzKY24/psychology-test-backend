/**
 * Settings the certificate owns.
 *
 * The institution code is deliberately *not* duplicated here: it identifies
 * the issuing clinic, which is the same entity for a report and a certificate.
 * A second key would let the two drift and print two codes for one clinic.
 */
export const CERTIFICATE_SETTING_KEYS = {
  /** Printed as `<KOTA>, <tanggal>` above the signature. */
  city: 'certificate.city',
} as const;

/**
 * Used until `certificate.city` is set. The whole application already runs on
 * the Asia/Jakarta calendar, so this is the same city the issue date implies.
 */
export const DEFAULT_CERTIFICATE_CITY = 'Jakarta';
