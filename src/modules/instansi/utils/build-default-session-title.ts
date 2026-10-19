const MONTHS_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

/**
 * Default batch title filled at checkout (owner decision #9): first test name
 * (+N others), the institution name, and the checkout date. Admin can tidy it
 * up later. Truncated to the session title column budget (200).
 */
export function buildDefaultSessionTitle(
  testNames: string[],
  institutionName: string,
  date: Date,
): string {
  const first = testNames[0] ?? 'Tes';
  const extra = testNames.length - 1;
  const label = extra > 0 ? `${first} +${extra} lainnya` : first;
  const day = String(date.getDate()).padStart(2, '0');
  const stamp = `${day} ${MONTHS_ID[date.getMonth()]} ${date.getFullYear()}`;
  return `${label} — ${institutionName} — ${stamp}`.slice(0, 200);
}
