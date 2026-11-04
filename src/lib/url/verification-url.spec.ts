import { verificationUrl } from './verification-url';

describe('verificationUrl', () => {
  it('points at the public verification page', () => {
    expect(
      verificationUrl(
        'https://psikologitest.id',
        'verifikasi-sertifikat',
        'ABC123',
      ),
    ).toBe('https://psikologitest.id/verifikasi-sertifikat/ABC123');
  });

  it('trims the trailing slash so the path never doubles up', () => {
    expect(
      verificationUrl(
        'https://psikologitest.id/',
        'verifikasi-laporan',
        'ABC123',
      ),
    ).toBe('https://psikologitest.id/verifikasi-laporan/ABC123');
  });

  it('trims stray whitespace from the configured value', () => {
    expect(
      verificationUrl(
        '  https://psikologitest.id  ',
        'verifikasi-sertifikat',
        'ABC123',
      ),
    ).toBe('https://psikologitest.id/verifikasi-sertifikat/ABC123');
  });

  /**
   * A bare code cannot be scanned from paper, so the caller is told instead of
   * being handed a QR that has to be typed in.
   */
  it('returns null when APP_PUBLIC_URL is missing or blank', () => {
    expect(verificationUrl('', 'verifikasi-sertifikat', 'ABC123')).toBeNull();
    expect(
      verificationUrl('   ', 'verifikasi-sertifikat', 'ABC123'),
    ).toBeNull();
    expect(
      verificationUrl(undefined, 'verifikasi-sertifikat', 'ABC123'),
    ).toBeNull();
    expect(verificationUrl(null, 'verifikasi-sertifikat', 'ABC123')).toBeNull();
  });
});
