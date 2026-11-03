const NUMERIC_RE = /^-?(\d+\.?\d*|\.\d+)$/;

/**
 * Short answers are compared, not interpreted: lowercase, no whitespace,
 * comma read as a decimal point, leading "Rp" dropped. `0,125` and `0.125`
 * therefore match, and a list answer (`1,2,4,5`) matches only itself.
 */
export function normalizeAnswerText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/,/g, '.')
    .replace(/^rp\.?/, '');
}

/** Numeric answers compare by value, so `.33` equals `0.33`. */
export function answersMatch(given: string, expected: string): boolean {
  const a = normalizeAnswerText(given);
  const b = normalizeAnswerText(expected);
  if (a === b) return true;
  if (NUMERIC_RE.test(a) && NUMERIC_RE.test(b)) {
    return Math.abs(Number(a) - Number(b)) < 1e-9;
  }
  return false;
}

/** Choice answers compare as sets, so `1,4` equals `4,1`. */
export function sameIndexSet(given: number[], expected: number[]): boolean {
  if (given.length !== expected.length) return false;
  const a = [...new Set(given)].sort((x, y) => x - y);
  const b = [...new Set(expected)].sort((x, y) => x - y);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
