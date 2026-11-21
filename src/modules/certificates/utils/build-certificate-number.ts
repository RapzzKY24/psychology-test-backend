import { romanMonth } from '../../reports/utils/roman-month';
import { sanitizeNumberSegment } from '../../reports/utils/sanitize-number-segment';
import { testNumberLabel } from './test-number-label';

export interface CertificateNumberParts {
  seq: number;
  /** Short label derived from the test name, e.g. "CPMI" or "WPT". */
  testName: string;
  /** Institution initials from `report.institution_code`, e.g. "YM". */
  institutionCode: string;
  /** 1–12, from the Jakarta calendar. */
  month: number;
  year: number;
}

/**
 * `050/CPMI/YM/XI/2026`
 *
 * The test segment is the instrument's short label, not its full name, so a
 * long title like "WPT (Wonderlic Personnel Test)" prints as `WPT`. The
 * sequence is padded to three digits and never truncated: 999 is followed by
 * 1000, which reads longer but stays unique.
 */
export function buildCertificateNumber(parts: CertificateNumberParts): string {
  const seq = String(parts.seq).padStart(3, '0');
  const test = testNumberLabel(parts.testName);
  const code = sanitizeNumberSegment(parts.institutionCode);
  return `${seq}/${test}/${code}/${romanMonth(parts.month)}/${parts.year}`;
}
