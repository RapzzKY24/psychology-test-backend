import { romanMonth } from '../utils/roman-month';

describe('romanMonth', () => {
  it('maps all twelve months', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(romanMonth)).toEqual([
      'I',
      'II',
      'III',
      'IV',
      'V',
      'VI',
      'VII',
      'VIII',
      'IX',
      'X',
      'XI',
      'XII',
    ]);
  });

  it('throws below 1', () => {
    expect(() => romanMonth(0)).toThrow(RangeError);
  });

  it('throws above 12', () => {
    expect(() => romanMonth(13)).toThrow(RangeError);
  });

  it('throws for a fraction', () => {
    expect(() => romanMonth(1.5)).toThrow(RangeError);
  });
});
