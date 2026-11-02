const ROMAN = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
] as const;

/** 1 → I, 12 → XII. Throws for anything outside 1–12 so a bad date never
 * silently produces a wrong report number. */
export function romanMonth(month: number): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`romanMonth expects 1-12, received ${month}`);
  }
  return ROMAN[month - 1];
}
