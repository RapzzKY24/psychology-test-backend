import {
  DEFAULT_INSTITUTION_CODE,
  REPORT_SETTING_KEYS,
} from '../reports/report-settings';
import type { CertificatesRepository } from './repository/certificates.repository';

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

export interface CertificateSettings {
  institutionCode: string;
  city: string;
}

/**
 * Read by both issuance and the preview renderer, so a draft preview cannot
 * show a different city from the one the issued certificate will print.
 */
export async function readCertificateSettings(
  repo: Pick<CertificatesRepository, 'findSettings'>,
): Promise<CertificateSettings> {
  const rows = await repo.findSettings([
    REPORT_SETTING_KEYS.institutionCode,
    CERTIFICATE_SETTING_KEYS.city,
  ]);
  const pick = (key: string, fallback: string): string => {
    const value = rows[key];
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : fallback;
  };
  return {
    institutionCode: pick(
      REPORT_SETTING_KEYS.institutionCode,
      DEFAULT_INSTITUTION_CODE,
    ),
    city: pick(CERTIFICATE_SETTING_KEYS.city, DEFAULT_CERTIFICATE_CITY),
  };
}
