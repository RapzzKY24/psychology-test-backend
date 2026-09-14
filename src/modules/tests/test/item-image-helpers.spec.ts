import { validateItemImageFile } from '../utils/validate-item-image-file';
import { generateItemImageFilename } from '../utils/generate-item-image-filename';

describe('validateItemImageFile', () => {
  it('should accept png and jpeg', () => {
    expect(() =>
      validateItemImageFile({
        mimetype: 'image/png',
        size: 1024,
        originalname: 'a.png',
      } as never),
    ).not.toThrow();
    expect(() =>
      validateItemImageFile({
        mimetype: 'image/jpeg',
        size: 1024,
        originalname: 'a.jpg',
      } as never),
    ).not.toThrow();
  });

  it('should reject unsupported type', () => {
    expect(() =>
      validateItemImageFile({
        mimetype: 'image/svg+xml',
        size: 1024,
        originalname: 'a.svg',
      } as never),
    ).toThrow('unsupported_media_type');
  });

  it('should reject too large', () => {
    expect(() =>
      validateItemImageFile({
        mimetype: 'image/png',
        size: 3 * 1024 * 1024,
        originalname: 'a.png',
      } as never),
    ).toThrow('file_too_large');
  });

  it('should reject missing file', () => {
    expect(() => validateItemImageFile(null as never)).toThrow('file is required');
  });
});

describe('generateItemImageFilename', () => {
  it('should generate png for image/png', () => {
    const name = generateItemImageFilename('evil.exe', 'image/png');
    expect(name.endsWith('.png')).toBe(true);
    expect(name.includes('evil')).toBe(false);
  });

  it('should generate jpg for image/jpeg', () => {
    const name = generateItemImageFilename('a.png', 'image/jpeg');
    expect(name.endsWith('.jpg')).toBe(true);
  });
});
