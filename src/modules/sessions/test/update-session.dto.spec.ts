import { UpdateSessionSchema } from '../dto/update-session.dto';

describe('UpdateSessionSchema', () => {
  it('accepts a title-only payload', () => {
    expect(UpdateSessionSchema.safeParse({ title: 'Batch Baru' }).success).toBe(
      true,
    );
  });

  it('accepts an expiresAt-only payload in the future', () => {
    expect(
      UpdateSessionSchema.safeParse({
        expiresAt: new Date(Date.now() + 3600_000),
      }).success,
    ).toBe(true);
  });

  it('rejects an empty body (nothing to update)', () => {
    expect(UpdateSessionSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a past expiresAt', () => {
    expect(
      UpdateSessionSchema.safeParse({ expiresAt: new Date(Date.now() - 1000) })
        .success,
    ).toBe(false);
  });

  it('rejects unknown keys (admin can only touch title/expiresAt)', () => {
    expect(
      UpdateSessionSchema.safeParse({ title: 'X', status: 'CLOSED' }).success,
    ).toBe(false);
  });
});
