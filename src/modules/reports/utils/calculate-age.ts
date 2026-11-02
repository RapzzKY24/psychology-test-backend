/**
 * Whole years between `birthDate` and `at`. A birthday that has not happened
 * yet this year does not count, so someone born 2000-12-31 is 25 on 2026-11-02.
 * Returns null when the date is absent or unparsable — the report prints "-".
 */
export function calculateAge(
  birthDate: Date | null | undefined,
  at: Date,
): number | null {
  if (!birthDate || Number.isNaN(birthDate.getTime())) return null;

  let age = at.getFullYear() - birthDate.getFullYear();
  const monthDiff = at.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && at.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}
