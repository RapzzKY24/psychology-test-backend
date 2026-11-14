import { jakartaIsoDate } from '../../reports/utils/jakarta-date';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_MONTHS = 150 * 12;

/**
 * Whole months between an ISO birth date and `at`, on the Jakarta calendar.
 *
 * Date parts are compared directly instead of constructing a Date from the
 * string: `new Date('2000-01-01')` is UTC midnight, which is still 31 December
 * in Jakarta, and anyone born on the 1st would come out a month early.
 *
 * Returns null for anything unparsable, impossible (`2012-02-30`) or in the
 * future, so the caller can reject instead of scoring a wrong age band.
 */
export function ageInMonthsFromIsoDate(
  birthDate: string,
  at: Date,
): number | null {
  const match = ISO_DATE.exec(birthDate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  const [todayYear, todayMonth, todayDay] = jakartaIsoDate(at)
    .split('-')
    .map(Number);

  let months = (todayYear - year) * 12 + (todayMonth - month);
  // The birthday has not happened yet this month.
  if (todayDay < day) months -= 1;

  return months >= 0 && months <= MAX_MONTHS ? months : null;
}

/** Calendar part of a stored birth date — always UTC midnight by convention. */
export function isoDateOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}
