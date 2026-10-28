/**
 * Asia/Jakarta is a fixed UTC+7 offset (no DST since 1964), so bucket keys are
 * derived by shifting the instant instead of pulling in a date library.
 */
export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toWib(instant: Date): Date {
  return new Date(instant.getTime() + WIB_OFFSET_MS);
}

/** `2026-10-28` for the WIB calendar day that contains `instant`. */
export function wibDayKey(instant: Date): string {
  return toWib(instant).toISOString().slice(0, 10);
}

/** `2026-10` for the WIB calendar month that contains `instant`. */
export function wibMonthKey(instant: Date): string {
  return toWib(instant).toISOString().slice(0, 7);
}

/** Instant of 00:00 WIB on the first day of the month `monthsBack` months ago. */
export function startOfWibMonth(instant: Date, monthsBack = 0): Date {
  const wib = toWib(instant);
  const monthStart = Date.UTC(
    wib.getUTCFullYear(),
    wib.getUTCMonth() - monthsBack,
    1,
  );
  return new Date(monthStart - WIB_OFFSET_MS);
}

/** Instant of 00:00 WIB `daysBack` days ago. */
export function startOfWibDay(instant: Date, daysBack = 0): Date {
  const wib = toWib(instant);
  const dayStart = Date.UTC(
    wib.getUTCFullYear(),
    wib.getUTCMonth(),
    wib.getUTCDate(),
  );
  return new Date(dayStart - daysBack * MS_PER_DAY - WIB_OFFSET_MS);
}

/** Month keys, oldest first, ending with the month that contains `instant`. */
export function wibMonthKeys(instant: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    wibMonthKey(startOfWibMonth(instant, count - 1 - index)),
  );
}

/** Day keys, oldest first, ending with the day that contains `instant`. */
export function wibDayKeys(instant: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    wibDayKey(startOfWibDay(instant, count - 1 - index)),
  );
}
