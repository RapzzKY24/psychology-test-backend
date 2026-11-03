import { ageFromIsoDate } from '../utils/age-from-iso-date';

const AT = new Date('2026-11-03T05:00:00Z'); // 12:00 in Jakarta

describe('ageFromIsoDate', () => {
  it('counts whole years when the birthday has already passed', () => {
    expect(ageFromIsoDate('2000-01-15', AT)).toBe(26);
  });

  it('does not count a birthday that has not happened yet', () => {
    expect(ageFromIsoDate('2000-12-31', AT)).toBe(25);
  });

  it('counts a birthday that falls today', () => {
    expect(ageFromIsoDate('2000-11-03', AT)).toBe(26);
  });

  it('treats a birthday tomorrow as not yet reached', () => {
    expect(ageFromIsoDate('2000-11-04', AT)).toBe(25);
  });

  it('reads the day on the Jakarta calendar, not UTC', () => {
    // 2026-11-02T17:30Z is already 3 November in Jakarta, so someone born on
    // 2000-11-03 has had their birthday.
    const lateUtc = new Date('2026-11-02T17:30:00Z');

    expect(ageFromIsoDate('2000-11-03', lateUtc)).toBe(26);
  });

  it('returns null for a birth date in the future', () => {
    expect(ageFromIsoDate('2030-01-01', AT)).toBeNull();
  });

  it('returns null for anything that is not an ISO date', () => {
    expect(ageFromIsoDate('03-11-2000', AT)).toBeNull();
    expect(ageFromIsoDate('', AT)).toBeNull();
  });

  it('returns null for an impossible month', () => {
    expect(ageFromIsoDate('2000-13-01', AT)).toBeNull();
  });
});
