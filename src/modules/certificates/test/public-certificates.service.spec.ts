/* eslint-disable @typescript-eslint/unbound-method */
import { HttpException } from '@nestjs/common';
import { PublicCertificatesService } from '../service/public-certificates.service';
import type {
  CertificateVerification,
  CertificatesRepository,
} from '../repository/certificates.repository';
import type { CertificateSnapshot } from '../utils/certificate-snapshot';

const snapshot: CertificateSnapshot = {
  holder: {
    fullName: 'Budi Santoso',
    idNumber: '3201010101990001',
    gender: 'Laki-laki',
    birthPlace: 'Bogor',
    birthDate: '1999-01-01',
    age: 27,
    address: 'Jl. Merdeka 1, Bogor',
  },
  test: { name: 'Kraepelin', slug: 'kraepelin' },
  verdict: 'MEMENUHI_SYARAT',
  purpose: 'CPMI',
  validUntil: '2027-11-03',
  issuer: {
    fullName: 'Faradila',
    degree: 'M.Psi',
    sippNumber: '25022211674',
    signaturePath: 'uploads/sig.png',
  },
  photoPath: 'uploads/photo.png',
  number: '060/TES-KRAEPELIN/YM/XI/2026',
  city: 'Jakarta',
  issuedOn: '2026-11-03',
  issuedAt: '2026-11-03T03:15:00.000Z',
};

function verification(
  overrides: Partial<CertificateVerification> = {},
): CertificateVerification {
  return {
    number: '060/TES-KRAEPELIN/YM/XI/2026',
    revision: 1,
    status: 'ACTIVE',
    snapshot,
    issuedAt: new Date('2026-11-03T03:15:00.000Z'),
    revokedAt: null,
    revokeReason: null,
    ...overrides,
  };
}

describe('PublicCertificatesService', () => {
  let service: PublicCertificatesService;
  let repo: jest.Mocked<CertificatesRepository>;

  beforeEach(() => {
    repo = {
      findByVerifyCode: jest.fn(),
    } as unknown as jest.Mocked<CertificatesRepository>;
    service = new PublicCertificatesService(repo);
  });

  it('reports an unknown code as invalid', async () => {
    repo.findByVerifyCode.mockResolvedValue(null);

    await expect(service.verify('ABCD123456', '1.1.1.1')).resolves.toEqual({
      valid: false,
    });
  });

  it('normalises the scanned code before lookup', async () => {
    repo.findByVerifyCode.mockResolvedValue(null);

    await service.verify('  abcd123456 ', '1.1.1.1');

    expect(repo.findByVerifyCode).toHaveBeenCalledWith('ABCD123456');
  });

  it('does not query the database for a blank code', async () => {
    await expect(service.verify('   ', '1.1.1.1')).resolves.toEqual({
      valid: false,
    });
    expect(repo.findByVerifyCode).not.toHaveBeenCalled();
  });

  it('returns the public facts of an active certificate', async () => {
    repo.findByVerifyCode.mockResolvedValue(verification());

    const result = await service.verify('ABCD123456', '1.1.1.1');

    expect(result).toMatchObject({
      valid: true,
      number: '060/TES-KRAEPELIN/YM/XI/2026',
      revision: 1,
      status: 'ACTIVE',
      holderName: 'Budi S.',
      testName: 'Kraepelin',
      verdict: 'MEMENUHI_SYARAT',
      validUntil: '2027-11-03',
      issuerName: 'Faradila',
      issuerSipp: '25022211674',
    });
  });

  it('never exposes the identity block or the photo', async () => {
    repo.findByVerifyCode.mockResolvedValue(verification());

    const result = await service.verify('ABCD123456', '1.1.1.1');

    expect(JSON.stringify(result)).not.toContain('3201010101990001');
    expect(JSON.stringify(result)).not.toContain('Jl. Merdeka');
    expect(JSON.stringify(result)).not.toContain('uploads/photo.png');
  });

  it('keeps a revoked certificate visible but drops the verdict', async () => {
    repo.findByVerifyCode.mockResolvedValue(
      verification({
        status: 'REVOKED',
        revokedAt: new Date('2026-11-04T02:00:00.000Z'),
        revokeReason: 'salah input identitas',
      }),
    );

    const result = await service.verify('ABCD123456', '1.1.1.1');

    expect(result).toMatchObject({
      valid: true,
      status: 'REVOKED',
      revokeReason: 'salah input identitas',
      revokedAt: new Date('2026-11-04T02:00:00.000Z'),
    });
    expect(result.verdict).toBeUndefined();
    expect(result.validUntil).toBeUndefined();
  });

  it('treats a revision that is not current as unknown', async () => {
    repo.findByVerifyCode.mockResolvedValue(
      verification({ status: 'SUPERSEDED' }),
    );

    await expect(service.verify('ABCD123456', '1.1.1.1')).resolves.toEqual({
      valid: false,
    });
  });

  it('limits one IP to 30 verifications per minute', async () => {
    repo.findByVerifyCode.mockResolvedValue(null);

    for (let i = 0; i < 30; i++) {
      await service.verify('ABCD123456', '1.1.1.1');
    }

    await expect(
      service.verify('ABCD123456', '1.1.1.1'),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
