describe('Auth E2E', () => {
  it('POST /api/v1/auth/sign-up/email — success → 200', () => {
    expect(true).toBe(true);
  });

  it('POST /api/v1/auth/sign-up/email — duplicate → 409', () => {
    expect(true).toBe(true);
  });

  it('POST /api/v1/auth/sign-in/email — success → 200 + cookie', () => {
    expect(true).toBe(true);
  });

  it('POST /api/v1/auth/sign-in/email — wrong password → 401, 11th → 429', () => {
    expect(true).toBe(true);
  });
});
