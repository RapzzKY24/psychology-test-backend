import { JAKARTA_OFFSET_MINUTES } from '../constants/doku';

/**
 * ISO 8601 timestamp with +07:00 offset and second precision,
 * e.g. `2026-10-17T12:34:56+07:00` (matches Doku's `yyyy-MM-ddTHH:mm:ss+07:00`).
 */
export function isoTimestamp(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() + JAKARTA_OFFSET_MINUTES * 60 * 1000);
  const base = shifted.toISOString().slice(0, 19);
  return `${base}+07:00`;
}
