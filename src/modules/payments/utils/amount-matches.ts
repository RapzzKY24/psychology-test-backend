/** True when a GDC amount string equals the expected integer order amount. */
export function amountMatches(
  value: string | undefined,
  expected: number,
): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed === expected;
}
