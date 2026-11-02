import { romanMonth } from './roman-month';
import { sanitizeNumberSegment } from './sanitize-number-segment';

export interface ReportNumberParts {
  seq: number;
  sessionTitle: string;
  /** Institution initials from `report.institution_code`, e.g. "YM". */
  institutionCode: string;
  /** 1–12, from the Jakarta calendar. */
  month: number;
  year: number;
}

/**
 * `050/PSIKOTES/YM/XI/2026`
 *
 * The sequence is padded to three digits and never truncated: 999 is followed
 * by 1000, which reads longer but stays unique.
 */
export function buildReportNumber(parts: ReportNumberParts): string {
  const seq = String(parts.seq).padStart(3, '0');
  const test = sanitizeNumberSegment(parts.sessionTitle);
  const code = sanitizeNumberSegment(parts.institutionCode);
  return `${seq}/${test}/${code}/${romanMonth(parts.month)}/${parts.year}`;
}
