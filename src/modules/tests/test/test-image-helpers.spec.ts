import { validateTestImageFile } from '../utils/validate-test-image-file';
import { generateTestImageFilename } from '../utils/generate-test-image-filename';

describe('validateTestImageFile', () => {
  it('should accept png and jpeg', () => {
    expect(() =>
      validateTestImageFile({
        mimetype: 'image/png',
        size: 1024,
        originalname: 'a.png',
      } as never),
    ).not.toThrow();
    expect(() =>
      validateTestImageFile({
        mimetype: 'image/jpeg',
        size: 1024,
        originalname: 'a.jpg',
      } as never),
    ).not.toThrow();
  });

  it('should reject unsupported type', () => {
    expect(() =>
      validateTestImageFile({
        mimetype: 'image/svg+xml',
        size: 1024,
        originalname: 'a.svg',
      } as never),
    ).toThrow('unsupported_media_type');
  });

  it('should reject too large', () => {
    expect(() =>
      validateTestImageFile({
        mimetype: 'image/png',
        size: 3 * 1024 * 1024,
        originalname: 'a.png',
      } as never),
    ).toThrow('file_too_large');
  });

  it('should reject missing file', () => {
    expect(() => validateTestImageFile(null as never)).toThrow(
      'file is required',
    );
  });
});

describe('generateTestImageFilename', () => {
  it('should generate png for image/png', () => {
    const name = generateTestImageFilename('evil.exe', 'image/png');
    expect(name.endsWith('.png')).toBe(true);
    expect(name.includes('evil')).toBe(false);
  });

  it('should generate jpg for image/jpeg', () => {
    const name = generateTestImageFilename('a.png', 'image/jpeg');
    expect(name.endsWith('.jpg')).toBe(true);
  });
});
