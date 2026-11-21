import { buildReportNumber } from '../utils/build-report-number';

describe('buildReportNumber', () => {
  it('builds the first number of the year', () => {
    expect(
      buildReportNumber({
        seq: 50,
        name: 'Psikotes',
        institutionCode: 'YM',
        month: 11,
        year: 2026,
      }),
    ).toBe('050/PSIKOTES/YM/XI/2026');
  });

  it('uses the short test label when the session has one test', () => {
    expect(
      buildReportNumber({
        seq: 51,
        name: 'CPMI',
        institutionCode: 'YM',
        month: 11,
        year: 2026,
      }),
    ).toBe('051/CPMI/YM/XI/2026');
  });

  it('pads to three digits but never truncates', () => {
    const build = (seq: number): string =>
      buildReportNumber({
        seq,
        name: 'Psikotes',
        institutionCode: 'YM',
        month: 1,
        year: 2027,
      });
    expect(build(50)).toBe('050/PSIKOTES/YM/I/2027');
    expect(build(999)).toBe('999/PSIKOTES/YM/I/2027');
    expect(build(1000)).toBe('1000/PSIKOTES/YM/I/2027');
  });

  it('sanitises the name segment into one part', () => {
    expect(
      buildReportNumber({
        seq: 52,
        name: 'Psikotes / Batch 1',
        institutionCode: 'YM',
        month: 12,
        year: 2026,
      }),
    ).toBe('052/PSIKOTES-BATCH-1/YM/XII/2026');
  });

  it('rejects an impossible month', () => {
    expect(() =>
      buildReportNumber({
        seq: 1,
        name: 'Psikotes',
        institutionCode: 'YM',
        month: 13,
        year: 2026,
      }),
    ).toThrow(RangeError);
  });
});
