import { buildCertificateNumber } from '../utils/build-certificate-number';

const parts = {
  seq: 50,
  testName: 'CPMI',
  institutionCode: 'YM',
  month: 11,
  year: 2026,
};

describe('buildCertificateNumber', () => {
  it('prints the number, short test label, institution, Roman month and year', () => {
    expect(buildCertificateNumber(parts)).toBe('050/CPMI/YM/XI/2026');
  });

  it('uses the short label of a long instrument name', () => {
    expect(
      buildCertificateNumber({
        ...parts,
        seq: 51,
        testName: 'WPT (Wonderlic Personnel Test)',
        month: 12,
      }),
    ).toBe('051/WPT/YM/XII/2026');
  });

  it('keeps counting past three digits instead of truncating', () => {
    expect(buildCertificateNumber({ ...parts, seq: 1000 })).toBe(
      '1000/CPMI/YM/XI/2026',
    );
  });
});
