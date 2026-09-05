import { generateUniqueCode } from './generate-unique-code';
import { calcTotal } from './calc-total';

describe('generateUniqueCode', () => {
  it('should be 1..999', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateUniqueCode();
      expect(code).toBeGreaterThanOrEqual(1);
      expect(code).toBeLessThanOrEqual(999);
      expect(Number.isInteger(code)).toBe(true);
    }
  });
});

describe('calcTotal', () => {
  it('should sum basePrice and code', () => {
    expect(calcTotal(200000, 123)).toBe(200123);
    expect(calcTotal(0, 999)).toBe(999);
  });
});
