import { CreateInstansiSessionSchema } from '../dto/create-instansi-session.dto';

const valid = {
  testIds: ['00000000-0000-4000-8000-000000000001'],
  slotLimit: 10,
};

describe('CreateInstansiSessionSchema', () => {
  it('accepts a minimal payload (tests + slotLimit only)', () => {
    expect(CreateInstansiSessionSchema.safeParse(valid).success).toBe(true);
  });

  it('defaults employeeIds to an empty roster', () => {
    const result = CreateInstansiSessionSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.employeeIds).toEqual([]);
  });

  it('accepts an explicit employee roster', () => {
    const result = CreateInstansiSessionSchema.safeParse({
      ...valid,
      employeeIds: [
        '00000000-0000-4000-8000-000000000011',
        '00000000-0000-4000-8000-000000000012',
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects duplicate employeeIds', () => {
    const result = CreateInstansiSessionSchema.safeParse({
      ...valid,
      employeeIds: [
        '00000000-0000-4000-8000-000000000011',
        '00000000-0000-4000-8000-000000000011',
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          i.message.includes('employeeIds must be unique'),
        ),
      ).toBe(true);
    }
  });

  it('rejects duplicate testIds', () => {
    const result = CreateInstansiSessionSchema.safeParse({
      ...valid,
      testIds: [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001',
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid ids', () => {
    expect(
      CreateInstansiSessionSchema.safeParse({ ...valid, testIds: ['test-1'] })
        .success,
    ).toBe(false);
  });

  it('rejects a non-positive slotLimit', () => {
    expect(
      CreateInstansiSessionSchema.safeParse({ ...valid, slotLimit: 0 }).success,
    ).toBe(false);
  });

  it('rejects instansi-supplied title/expiresAt/pin (system-filled)', () => {
    expect(
      CreateInstansiSessionSchema.safeParse({
        ...valid,
        title: 'Sesi Rekrutmen',
        expiresAt: new Date(Date.now() + 3600_000),
        pin: '1234',
      }).success,
    ).toBe(false);
  });
});
