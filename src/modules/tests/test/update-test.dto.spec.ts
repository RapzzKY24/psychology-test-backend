import { UpdateTestSchema } from '../dto/update-test.dto';

describe('UpdateTestSchema imageUrl', () => {
  it('accepts a cover path produced by the upload endpoint', () => {
    const result = UpdateTestSchema.safeParse({
      imageUrl: '/uploads/test-covers/6f1c.png',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null to clear the cover', () => {
    const result = UpdateTestSchema.safeParse({ imageUrl: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.imageUrl).toBeNull();
  });

  it('rejects an external or unrelated URL', () => {
    expect(
      UpdateTestSchema.safeParse({ imageUrl: 'https://evil.test/a.png' })
        .success,
    ).toBe(false);
    expect(
      UpdateTestSchema.safeParse({ imageUrl: '/uploads/qris/a.png' }).success,
    ).toBe(false);
  });
});
