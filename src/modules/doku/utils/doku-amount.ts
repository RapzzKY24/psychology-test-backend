/**
 * Doku sends amounts as strings, sometimes with decimals ("20000.00").
 *
 * Returns null when there is no usable amount at all, never 0: an absent amount
 * means "unknown", and a settlement without a provable amount must be rejected
 * rather than compared against zero.
 */
export function toRupiah(
  value: string | number | undefined | null,
): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}
