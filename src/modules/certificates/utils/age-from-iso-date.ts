import { jakartaIsoDate } from '../../reports/utils/jakarta-date';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Whole years between an ISO birth date and `at`, on the Jakarta calendar.
 *
 * Works on the date parts rather than a Date object: `new Date('2000-01-01')`
 * is UTC midnight, which is still 31 December in Jakarta, and the age would
 * come out one day early for anyone born on the 1st.
 *
 * Returns null for anything unparsable or in the future, so the caller can
 * keep whatever the psychologist typed instead of writing a wrong number.
 */
export function ageFromIsoDate(birthDate: string, at: Date): number | null {
  const match = ISO_DATE.exec(birthDate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const [todayYear, todayMonth, todayDay] = jakartaIsoDate(at)
    .split('-')
    .map(Number);

  let age = todayYear - year;
  // The birthday has not happened yet this year.
  if (todayMonth < month || (todayMonth === month && todayDay < day)) age -= 1;

  return age >= 0 && age <= 150 ? age : null;
}
