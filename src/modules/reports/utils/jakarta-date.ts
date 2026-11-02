const FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Report numbers use the Jakarta calendar, not the server's: an issue at
 * 2026-12-31T18:00Z is already 1 January 2027 in Jakarta and must land in the
 * new year's sequence.
 */
export function jakartaDateParts(at: Date): {
  year: number;
  month: number;
  day: number;
} {
  const parts = FORMATTER.formatToParts(at);
  const pick = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

/** `YYYY-MM-DD` in Jakarta. */
export function jakartaIsoDate(at: Date): string {
  const { year, month, day } = jakartaDateParts(at);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
