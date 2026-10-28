import {
  startOfWibDay,
  startOfWibMonth,
  wibDayKey,
  wibDayKeys,
  wibMonthKey,
  wibMonthKeys,
} from '../utils/wib';

// 2026-10-28T20:30:00Z === 2026-10-29 03:30 WIB (crosses the day boundary).
const LATE_UTC = new Date('2026-10-28T20:30:00Z');

describe('wib utils', () => {
  it('should bucket a UTC instant into the WIB calendar day', () => {
    expect(wibDayKey(LATE_UTC)).toBe('2026-10-29');
    expect(wibDayKey(new Date('2026-10-28T16:59:59Z'))).toBe('2026-10-28');
  });

  it('should bucket a UTC instant into the WIB calendar month', () => {
    expect(wibMonthKey(new Date('2026-10-31T18:00:00Z'))).toBe('2026-11');
    expect(wibMonthKey(new Date('2026-10-31T16:59:59Z'))).toBe('2026-10');
  });

  it('should return 00:00 WIB as 17:00 UTC the day before', () => {
    const start = startOfWibMonth(new Date('2026-10-28T05:00:00Z'), 0);
    expect(start.toISOString()).toBe('2026-09-30T17:00:00.000Z');

    const day = startOfWibDay(new Date('2026-10-28T05:00:00Z'), 0);
    expect(day.toISOString()).toBe('2026-10-27T17:00:00.000Z');
  });

  it('should step back across a year boundary', () => {
    const start = startOfWibMonth(new Date('2026-02-10T05:00:00Z'), 3);
    expect(start.toISOString()).toBe('2025-10-31T17:00:00.000Z');
  });

  it('should list month keys oldest first', () => {
    expect(wibMonthKeys(new Date('2026-02-10T05:00:00Z'), 4)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('should list day keys oldest first', () => {
    expect(wibDayKeys(new Date('2026-03-02T05:00:00Z'), 3)).toEqual([
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
  });

  it('should keep the last day key equal to the current WIB day', () => {
    const keys = wibDayKeys(LATE_UTC, 14);
    expect(keys).toHaveLength(14);
    expect(keys.at(-1)).toBe('2026-10-29');
  });
});
