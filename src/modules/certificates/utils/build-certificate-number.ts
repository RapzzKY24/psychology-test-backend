import { romanMonth } from '../../reports/utils/roman-month';
import { sanitizeNumberSegment } from '../../reports/utils/sanitize-number-segment';

export interface CertificateNumberParts {
  seq: number;
  /** Printed after `HASIL TES PSIKOLOGI -`, e.g. "Tes Kraepelin". */
  testName: string;
  /** Institution initials from `report.institution_code`, e.g. "YM". */
  institutionCode: string;
  /** 1–12, from the Jakarta calendar. */
  month: number;
  year: number;
}

/**
 * `060/TES-KRAEPELIN/YM/XI/2026`
 *
 * Same shape as a report number, but the series starts at 060 so the two are
 * distinguishable at a glance. The sequence is padded to three digits and never
 * truncated: 999 is followed by 1000, which reads longer but stays unique.
 */
export function buildCertificateNumber(parts: CertificateNumberParts): string {
  const seq = String(parts.seq).padStart(3, '0');
  const test = sanitizeNumberSegment(parts.testName);
  const code = sanitizeNumberSegment(parts.institutionCode);
  return `${seq}/${test}/${code}/${romanMonth(parts.month)}/${parts.year}`;
}
