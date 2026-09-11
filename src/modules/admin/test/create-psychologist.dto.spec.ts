import { CreatePsychologistSchema } from '../dto/create-psychologist.dto';

const valid = {
  name: 'Dr. Sinta',
  nik: '3201010101010001',
  institutionName: 'RS Harapan',
  email: 'sinta@example.com',
  password: 'rahasia123',
};

describe('CreatePsychologistSchema', () => {
  it('should accept a valid payload', () => {
    expect(CreatePsychologistSchema.safeParse(valid).success).toBe(true);
  });

  it('should reject NIK that is not 16 digits', () => {
    for (const nik of ['12345', '32010101010100010', 'abcdefghijklmnop', '']) {
      const result = CreatePsychologistSchema.safeParse({ ...valid, nik });
      expect(result.success).toBe(false);
    }
  });

  it('should reject bad email and short password', () => {
    expect(
      CreatePsychologistSchema.safeParse({ ...valid, email: 'bukan-email' })
        .success,
    ).toBe(false);
    expect(
      CreatePsychologistSchema.safeParse({ ...valid, password: 'pendek' })
        .success,
    ).toBe(false);
  });
});
