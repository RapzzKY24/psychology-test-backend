import {
  DRAFT_CERTIFICATE_FILENAME,
  certificateFileName,
} from '../utils/certificate-filename';

describe('certificateFileName', () => {
  it('turns the number into a filename', () => {
    expect(certificateFileName('060/TES-KRAEPELIN/YM/XI/2026')).toBe(
      'Sertifikat-060-TES-KRAEPELIN-YM-XI-2026.pdf',
    );
  });

  it('strips every character a filesystem or browser would reject', () => {
    expect(certificateFileName('a/b\\c:d*e?f"g<h>i|j')).toBe(
      'Sertifikat-a-b-c-d-e-f-g-h-i-j.pdf',
    );
  });

  it('names the preview after the draft, never after a number', () => {
    expect(DRAFT_CERTIFICATE_FILENAME).toBe('Draf-Sertifikat.pdf');
  });
});
