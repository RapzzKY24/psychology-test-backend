import {
  CreateInstansiParticipantSchema,
  UpdateInstansiParticipantSchema,
} from '../dto/create-instansi-participant.dto';

const valid = {
  name: 'Budi Santoso',
  destinationCountry: 'Belanda',
  idType: 'NIK',
  idNumber: '3201234567890001',
} as const;

describe('CreateInstansiParticipantSchema', () => {
  it('accepts a two-word name', () => {
    expect(CreateInstansiParticipantSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a single-word name', () => {
    const result = CreateInstansiParticipantSchema.safeParse({
      ...valid,
      name: 'Budi',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'name')).toBe(
        true,
      );
    }
  });

  it('rejects a blank name', () => {
    expect(
      CreateInstansiParticipantSchema.safeParse({ ...valid, name: '   ' })
        .success,
    ).toBe(false);
  });

  it('rejects an invalid idType', () => {
    expect(
      CreateInstansiParticipantSchema.safeParse({ ...valid, idType: 'KTP' })
        .success,
    ).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(
      CreateInstansiParticipantSchema.safeParse({
        ...valid,
        institutionId: 'other-inst',
      }).success,
    ).toBe(false);
  });

  it('update schema keeps the name rule when name is present', () => {
    expect(
      UpdateInstansiParticipantSchema.safeParse({ name: 'Budi' }).success,
    ).toBe(false);
    expect(
      UpdateInstansiParticipantSchema.safeParse({ name: 'Budi Santoso' })
        .success,
    ).toBe(true);
    expect(UpdateInstansiParticipantSchema.safeParse({}).success).toBe(true);
  });
});
