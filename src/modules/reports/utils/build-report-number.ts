import { romanMonth } from './roman-month';
import { sanitizeNumberSegment } from './sanitize-number-segment';

export interface ReportNumberParts {
  seq: number;
  /**
   * Name segment: the short test label when the session has one test, the
   * session title otherwise. Already chosen by the caller.
   */
  name: string;
  /** Institution initials from `report.institution_code`, e.g. "YM". */
  institutionCode: string;
  /** 1–12, from the Jakarta calendar. */
  month: number;
  year: number;
}

/**
 * `050/CPMI/YM/XI/2026`
 *
 * The sequence is padded to three digits and never truncated: 999 is followed
 * by 1000, which reads longer but stays unique.
 */
export function buildReportNumber(parts: ReportNumberParts): string {
  const seq = String(parts.seq).padStart(3, '0');
  const name = sanitizeNumberSegment(parts.name);
  const code = sanitizeNumberSegment(parts.institutionCode);
  return `${seq}/${name}/${code}/${romanMonth(parts.month)}/${parts.year}`;
}
