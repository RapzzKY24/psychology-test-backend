import { jakartaDateParts, jakartaIsoDate } from '../utils/jakarta-date';

describe('jakartaDateParts', () => {
  it('reads the Jakarta calendar, not UTC', () => {
    expect(jakartaDateParts(new Date('2026-12-31T18:00:00Z'))).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    });
  });

  it('keeps the same day for an afternoon UTC timestamp', () => {
    expect(jakartaDateParts(new Date('2026-11-02T03:15:00Z'))).toEqual({
      year: 2026,
      month: 11,
      day: 2,
    });
  });

  it('rolls the day forward for a late UTC timestamp', () => {
    expect(jakartaDateParts(new Date('2026-11-02T20:00:00Z'))).toEqual({
      year: 2026,
      month: 11,
      day: 3,
    });
  });
});

describe('jakartaIsoDate', () => {
  it('formats as YYYY-MM-DD with zero padding', () => {
    expect(jakartaIsoDate(new Date('2026-01-05T02:00:00Z'))).toBe('2026-01-05');
  });
});
