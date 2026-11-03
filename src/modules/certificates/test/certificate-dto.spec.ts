import { CreateCertificateSchema } from '../dto/create-certificate.dto';
import { UpdateCertificateSchema } from '../dto/update-certificate.dto';
import { jakartaIsoDate } from '../../reports/utils/jakarta-date';

/** Shifts today's Jakarta date by `days` and returns it as YYYY-MM-DD. */
function dayFromToday(days: number): string {
  const base = new Date(`${jakartaIsoDate(new Date())}T00:00:00+07:00`);
  base.setUTCDate(base.getUTCDate() + days);
  return jakartaIsoDate(base);
}

describe('CreateCertificateSchema', () => {
  it('accepts a uuid resultId', () => {
    const id = '3f1c8f0e-8a2b-4b6e-9d3a-1c2d3e4f5a6b';

    expect(CreateCertificateSchema.parse({ resultId: id })).toEqual({
      resultId: id,
    });
  });

  it('rejects anything that is not a uuid', () => {
    expect(() =>
      CreateCertificateSchema.parse({ resultId: 'res-1' }),
    ).toThrow();
  });

  it('rejects extra keys so a client cannot smuggle a field', () => {
    expect(() =>
      CreateCertificateSchema.parse({
        resultId: '3f1c8f0e-8a2b-4b6e-9d3a-1c2d3e4f5a6b',
        number: '060/TES/YM/XI/2026',
      }),
    ).toThrow();
  });
});

describe('UpdateCertificateSchema', () => {
  it('accepts an empty patch, so a draft can be saved untouched', () => {
    expect(UpdateCertificateSchema.parse({})).toEqual({});
  });

  it('accepts a partial identity block', () => {
    expect(
      UpdateCertificateSchema.parse({ identity: { fullName: 'Budi' } }),
    ).toEqual({ identity: { fullName: 'Budi' } });
  });

  it('rejects a purpose shorter than three characters', () => {
    expect(() => UpdateCertificateSchema.parse({ purpose: 'ab' })).toThrow();
  });

  it('accepts a purpose of exactly three characters', () => {
    expect(UpdateCertificateSchema.parse({ purpose: 'CPM' })).toEqual({
      purpose: 'CPM',
    });
  });

  it('rejects a validity date in the past', () => {
    expect(() =>
      UpdateCertificateSchema.parse({ validUntil: dayFromToday(-1) }),
    ).toThrow();
  });

  it('rejects today, because the certificate would expire on issue', () => {
    expect(() =>
      UpdateCertificateSchema.parse({ validUntil: dayFromToday(0) }),
    ).toThrow();
  });

  it('accepts a validity date in the future', () => {
    const validUntil = dayFromToday(30);

    expect(UpdateCertificateSchema.parse({ validUntil })).toEqual({
      validUntil,
    });
  });

  it('accepts null to clear the validity date', () => {
    expect(UpdateCertificateSchema.parse({ validUntil: null })).toEqual({
      validUntil: null,
    });
  });

  it('rejects a date that is not YYYY-MM-DD', () => {
    expect(() =>
      UpdateCertificateSchema.parse({ validUntil: '31-12-2027' }),
    ).toThrow();
  });

  it('rejects a gender outside the two printed values', () => {
    expect(() =>
      UpdateCertificateSchema.parse({ identity: { gender: 'Laki-laki' } }),
    ).toThrow();
  });

  it('rejects an age that is not a whole number', () => {
    expect(() =>
      UpdateCertificateSchema.parse({ identity: { age: 30.5 } }),
    ).toThrow();
  });

  it('rejects a verdict outside the two allowed values', () => {
    expect(() => UpdateCertificateSchema.parse({ verdict: 'LULUS' })).toThrow();
  });
});
