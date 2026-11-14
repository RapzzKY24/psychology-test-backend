import { ageInMonthsFromIsoDate, isoDateOf } from '../utils/age-in-months';

describe('ageInMonthsFromIsoDate', () => {
  it('counts completed months, not calendar months', () => {
    expect(
      ageInMonthsFromIsoDate('2012-03-09', new Date('2026-03-09T05:00:00Z')),
    ).toBe(168);
    expect(
      ageInMonthsFromIsoDate('2012-03-09', new Date('2026-03-08T05:00:00Z')),
    ).toBe(167);
    expect(
      ageInMonthsFromIsoDate('2012-03-09', new Date('2026-04-09T05:00:00Z')),
    ).toBe(169);
  });

  it('reads the reference instant on the Jakarta calendar', () => {
    // 17:30 UTC is already 00:30 on 9 March in Jakarta (UTC+7).
    expect(
      ageInMonthsFromIsoDate('2012-03-09', new Date('2026-03-08T17:30:00Z')),
    ).toBe(168);
  });

  it('rejects impossible, future and malformed dates', () => {
    expect(ageInMonthsFromIsoDate('2012-02-30', new Date())).toBeNull();
    expect(ageInMonthsFromIsoDate('2999-01-01', new Date())).toBeNull();
    expect(ageInMonthsFromIsoDate('09-03-2012', new Date())).toBeNull();
    expect(ageInMonthsFromIsoDate('', new Date())).toBeNull();
  });
});

describe('isoDateOf', () => {
  it('returns the UTC calendar part used when storing the birth date', () => {
    expect(isoDateOf(new Date('2012-03-09T00:00:00.000Z'))).toBe('2012-03-09');
  });
});
