import { sanitizeNumberSegment } from '../utils/sanitize-number-segment';

describe('sanitizeNumberSegment', () => {
  it('uppercases and joins words with a dash', () => {
    expect(sanitizeNumberSegment('Psikotes Batch 1')).toBe('PSIKOTES-BATCH-1');
  });

  it('removes slashes so the number keeps four segments', () => {
    expect(sanitizeNumberSegment('Psikotes / Batch 1')).toBe(
      'PSIKOTES-BATCH-1',
    );
  });

  it('drops leading and trailing separators', () => {
    expect(sanitizeNumberSegment('  / Psikotes /  ')).toBe('PSIKOTES');
  });

  it('strips punctuation', () => {
    expect(sanitizeNumberSegment('Psikotes (CPMI) - Gel.2')).toBe(
      'PSIKOTES-CPMI-GEL-2',
    );
  });

  it('truncates to 20 characters without a trailing dash', () => {
    const result = sanitizeNumberSegment('Psikotes Batch November CPMI 2026');
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result.endsWith('-')).toBe(false);
  });

  it('falls back when nothing usable is left', () => {
    expect(sanitizeNumberSegment('///')).toBe('PSIKOTES');
    expect(sanitizeNumberSegment('')).toBe('PSIKOTES');
  });
});
