/* eslint-disable @typescript-eslint/unbound-method */
import { HttpException } from '@nestjs/common';
import { PublicReportsService } from '../service/public-reports.service';
import type {
  ReportVerification,
  ReportsRepository,
} from '../repository/reports.repository';

function verification(
  overrides: Partial<ReportVerification> = {},
): ReportVerification {
  return {
    number: '050/PSIKOTES/YM/XI/2026',
    revision: 1,
    status: 'ACTIVE',
    snapshot: {
      holder: {
        name: 'Budi Santoso',
        age: 27,
        education: 'SMA',
        destination: 'Taiwan',
      },
      session: { id: 's1', title: 'Psikotes CPMI Batch November' },
      tests: [{ name: 'DISC', patternCode: 'I' }],
      assessor: {
        fullName: 'Faradila',
        degree: 'M.Psi',
        licenseNumber: '25022211674',
        sippNumber: null,
        signaturePath: 'uploads/sig.png',
      },
      institution: 'YULIARPAN MEDIKA/ETP',
      ratings: { 'intellectual.logic': 'B' },
      narratives: { 'conclusion.intellectual': 'Baik.' },
      recommendation: 'LAYAK',
      examDate: '2026-01-11',
      issuedAt: '2026-11-02T03:15:00.000Z',
    },
    issuedAt: new Date('2026-11-02T03:15:00.000Z'),
    revokedAt: null,
    revokeReason: null,
    ...overrides,
  };
}

describe('PublicReportsService', () => {
  let service: PublicReportsService;
  let repo: jest.Mocked<ReportsRepository>;

  beforeEach(() => {
    repo = {
      findByVerifyCode: jest.fn(),
    } as unknown as jest.Mocked<ReportsRepository>;
    service = new PublicReportsService(repo);
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

  it('masks the holder name and keeps the recommendation for an active report', async () => {
    repo.findByVerifyCode.mockResolvedValue(verification());

    const result = await service.verify('ABCD123456', '1.1.1.1');

    expect(result).toMatchObject({
      valid: true,
      number: '050/PSIKOTES/YM/XI/2026',
      revision: 1,
      status: 'ACTIVE',
      holderName: 'Budi S.',
      sessionTitle: 'Psikotes CPMI Batch November',
      recommendation: 'LAYAK',
    });
  });

  it('hides the recommendation once a report is revoked', async () => {
    repo.findByVerifyCode.mockResolvedValue(
      verification({
        status: 'REVOKED',
        revokedAt: new Date('2026-11-03T02:00:00.000Z'),
        revokeReason: 'salah input nilai',
      }),
    );

    const result = await service.verify('ABCD123456', '1.1.1.1');

    expect(result.status).toBe('REVOKED');
    expect(result.revokeReason).toBe('salah input nilai');
    expect(result.revokedAt).toEqual(new Date('2026-11-03T02:00:00.000Z'));
    expect(result.recommendation).toBeUndefined();
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

    await expect(service.verify('ABCD123456', '1.1.1.1')).rejects.toMatchObject(
      {
        status: 429,
      },
    );
  });

  it('keeps a separate bucket per IP', async () => {
    repo.findByVerifyCode.mockResolvedValue(null);

    for (let i = 0; i < 30; i++) {
      await service.verify('ABCD123456', '1.1.1.1');
    }

    await expect(service.verify('ABCD123456', '2.2.2.2')).resolves.toEqual({
      valid: false,
    });
  });

  it('throws an HttpException, not a bare Error, when limited', async () => {
    repo.findByVerifyCode.mockResolvedValue(null);
    for (let i = 0; i < 30; i++) {
      await service.verify('ABCD123456', '1.1.1.1');
    }

    await expect(
      service.verify('ABCD123456', '1.1.1.1'),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
