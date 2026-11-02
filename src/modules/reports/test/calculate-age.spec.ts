import { calculateAge } from '../utils/calculate-age';

describe('calculateAge', () => {
  const at = new Date(2026, 10, 2); // 2 November 2026, local time

  it('counts a birthday that already passed this year', () => {
    expect(calculateAge(new Date(1999, 0, 11), at)).toBe(27);
  });

  it('does not count a birthday that has not happened yet', () => {
    expect(calculateAge(new Date(1999, 11, 31), at)).toBe(26);
  });

  it('counts a birthday that falls on the same day', () => {
    expect(calculateAge(new Date(1999, 10, 2), at)).toBe(27);
  });

  it('does not count a birthday one day away', () => {
    expect(calculateAge(new Date(1999, 10, 3), at)).toBe(26);
  });

  it('handles a leap-day birth date', () => {
    expect(calculateAge(new Date(2000, 1, 29), new Date(2026, 2, 1))).toBe(26);
  });

  it('returns null for a missing birth date', () => {
    expect(calculateAge(null, at)).toBeNull();
    expect(calculateAge(undefined, at)).toBeNull();
  });

  it('returns null for an invalid date', () => {
    expect(calculateAge(new Date('nope'), at)).toBeNull();
  });

  it('returns null for a birth date in the future', () => {
    expect(calculateAge(new Date(2030, 0, 1), at)).toBeNull();
  });
});
