/**
 * Absolute URL for a printed verification QR.
 *
 * A relative or missing base produces a code that cannot be scanned from
 * paper — it only works when someone types it in. Returning null lets each
 * module refuse the document instead of printing a dead code on it.
 */
export function verificationUrl(
  publicUrl: string | null | undefined,
  segment: string,
  code: string,
): string | null {
  const base = (publicUrl ?? '').trim().replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/${segment}/${code}`;
}
