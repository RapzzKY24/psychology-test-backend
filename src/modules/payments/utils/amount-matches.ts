/** True when a provider amount equals the expected integer order amount. */
export function amountMatches(
  value: string | number | null | undefined,
  expected: number,
): boolean {
  if (value === null || value === undefined || value === '') return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed === expected;
}
