/**
 * ISO 8601 timestamp with +07:00 offset and second precision,
 * e.g. `2026-10-17T12:34:56+07:00` (matches GDC's `2006-01-02T15:04:05Z07:00`).
 */
export function isoTimestamp(date: Date = new Date()): string {
  const offsetMinutes = 7 * 60;
  const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  const base = shifted.toISOString().slice(0, 19);
  return `${base}+07:00`;
}
