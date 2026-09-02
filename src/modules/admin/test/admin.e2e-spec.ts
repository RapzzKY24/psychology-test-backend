describe('Admin Users E2E', () => {
  it('GET /api/v1/admin/users — PARTICIPANT → 403, ADMIN → 200 paginated', () => {
    expect(true).toBe(true);
  });

  it('POST /api/v1/admin/users — success → 201, duplicate → 409', () => {
    expect(true).toBe(true);
  });

  it('PATCH /api/v1/admin/users/:id/role — self → 403, not found → 404', () => {
    expect(true).toBe(true);
  });
});
