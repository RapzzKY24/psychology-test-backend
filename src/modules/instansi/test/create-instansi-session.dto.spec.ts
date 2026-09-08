import { CreateInstansiSessionSchema } from '../dto/create-instansi-session.dto';

const valid = {
  title: 'Sesi Rekrutmen 1',
  testIds: ['00000000-0000-4000-8000-000000000001'],
  employeeIds: [
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000012',
  ],
  slotLimit: 10,
  expiresAt: new Date(Date.now() + 3600_000),
};

describe('CreateInstansiSessionSchema', () => {
  it('accepts a valid payload', () => {
    expect(CreateInstansiSessionSchema.safeParse(valid).success).toBe(true);
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

  it('rejects a past expiresAt', () => {
    expect(
      CreateInstansiSessionSchema.safeParse({
        ...valid,
        expiresAt: new Date(Date.now() - 1000),
      }).success,
    ).toBe(false);
  });

  it('rejects non-uuid ids', () => {
    expect(
      CreateInstansiSessionSchema.safeParse({ ...valid, testIds: ['test-1'] })
        .success,
    ).toBe(false);
  });
});
