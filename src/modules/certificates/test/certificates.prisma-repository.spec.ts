import { PrismaCertificatesRepository } from '../repository/certificates.prisma-repository';
import type { PrismaService } from '../../../prisma/prisma.service';

const REVOKED_ROW = {
  id: 'cert-1',
  resultId: 'res-1',
  status: 'REVOKED',
  identity: {
    fullName: 'Budi',
    idNumber: '3201',
    gender: 'LAKI_LAKI',
    birthPlace: 'Bandung',
    birthDate: '1996-01-01',
    age: 30,
    address: 'Jl. Merdeka 1',
  },
  verdict: 'MEMENUHI_SYARAT',
  purpose: 'CPMI',
  validUntil: new Date('2027-12-31T00:00:00Z'),
  photoPath: 'uploads/certificates/p.png',
  filledById: 'psy-1',
  number: '060/CPMI/YM/XI/2026',
  seq: 60,
  year: 2026,
  revision: 1,
  supersedesId: null,
  verifyCode: 'XMRBDYN7MU',
  issuedAt: new Date('2026-11-04T01:31:45Z'),
  revokedAt: new Date('2026-11-04T02:00:00Z'),
  revokeReason: 'salah input identitas',
  updatedAt: new Date('2026-11-04T02:00:00Z'),
};

describe('PrismaCertificatesRepository', () => {
  let repo: PrismaCertificatesRepository;
  let prisma: {
    certificate: { aggregate: jest.Mock; update: jest.Mock };
  };

  beforeEach(() => {
    prisma = { certificate: { aggregate: jest.fn(), update: jest.fn() } };
    repo = new PrismaCertificatesRepository(prisma as unknown as PrismaService);
  });

  describe('nextSeq', () => {
    it('starts the series at 60 when the year has no rows', async () => {
      prisma.certificate.aggregate.mockResolvedValue({ _max: { seq: null } });

      await expect(repo.nextSeq(2026)).resolves.toBe(60);
    });

    it('continues from the highest sequence of that year', async () => {
      prisma.certificate.aggregate.mockResolvedValue({ _max: { seq: 60 } });

      await expect(repo.nextSeq(2026)).resolves.toBe(61);
    });

    it('keeps counting past three digits instead of wrapping', async () => {
      prisma.certificate.aggregate.mockResolvedValue({ _max: { seq: 999 } });

      await expect(repo.nextSeq(2026)).resolves.toBe(1000);
    });

    it('scopes the maximum to the requested year, so a new year restarts', async () => {
      prisma.certificate.aggregate.mockResolvedValue({ _max: { seq: null } });

      await repo.nextSeq(2027);

      expect(prisma.certificate.aggregate).toHaveBeenCalledWith({
        where: { year: 2027 },
        _max: { seq: true },
      });
    });
  });

  describe('revoke', () => {
    const patch = {
      reason: 'salah input identitas',
      revokedAt: new Date('2026-11-04T02:00:00Z'),
      revokedById: 'psy-1',
    };

    /**
     * Regression: clearing the code made a printed QR answer "no such
     * document" instead of "this certificate was cancelled", which is the
     * opposite of what D10 promises the holder.
     */
    it('keeps the verify code so a printed QR still resolves', async () => {
      prisma.certificate.update.mockResolvedValue(REVOKED_ROW);

      await repo.revoke('cert-1', patch);

      const calls = prisma.certificate.update.mock.calls as [
        { data: Record<string, unknown> },
      ][];
      const data = calls[0][0].data;
      expect(data).not.toHaveProperty('verifyCode');
      expect(data.status).toBe('REVOKED');
      expect(data.revokeReason).toBe('salah input identitas');
    });

    it('returns the row with the code intact', async () => {
      prisma.certificate.update.mockResolvedValue(REVOKED_ROW);

      const revoked = await repo.revoke('cert-1', patch);

      expect(revoked.verifyCode).toBe('XMRBDYN7MU');
      expect(revoked.status).toBe('REVOKED');
    });
  });
});
