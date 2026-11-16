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
    certificate: {
      aggregate: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      certificate: {
        aggregate: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
      },
    };
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

  describe('listIssuedByUser', () => {
    const row = {
      id: 'cert-1',
      number: '060/CPMI/YM/XI/2026',
      status: 'ACTIVE',
      issuedAt: new Date('2026-11-04T01:31:45Z'),
      validUntil: new Date('2027-12-31T00:00:00Z'),
      verifyCode: 'XMRBDYN7MU',
      result: { attempt: { test: { name: 'CPMI' } } },
    };

    it('only selects issued rows that belong to the caller', async () => {
      prisma.certificate.findMany.mockResolvedValue([row]);
      prisma.certificate.count.mockResolvedValue(1);

      await repo.listIssuedByUser({ userId: 'u1', skip: 0, take: 10 });

      expect(prisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: { in: ['ACTIVE', 'REVOKED'] },
            number: { not: null },
            issuedAt: { not: null },
            result: { attempt: { userId: 'u1' } },
          },
        }),
      );
      expect(prisma.certificate.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          result: { attempt: { userId: 'u1' } },
        }) as unknown,
      });
    });

    it('maps the test name and keeps the printed number', async () => {
      prisma.certificate.findMany.mockResolvedValue([row]);
      prisma.certificate.count.mockResolvedValue(1);

      const { data, total } = await repo.listIssuedByUser({
        userId: 'u1',
        skip: 0,
        take: 10,
      });

      expect(total).toBe(1);
      expect(data).toEqual([
        {
          id: 'cert-1',
          number: '060/CPMI/YM/XI/2026',
          status: 'ACTIVE',
          testName: 'CPMI',
          issuedAt: new Date('2026-11-04T01:31:45Z'),
          validUntil: new Date('2027-12-31T00:00:00Z'),
          verifyCode: 'XMRBDYN7MU',
        },
      ]);
    });

    it('orders newest first with the id as the tie-breaker', async () => {
      prisma.certificate.findMany.mockResolvedValue([]);
      prisma.certificate.count.mockResolvedValue(0);

      await repo.listIssuedByUser({ userId: 'u1', skip: 0, take: 10 });

      expect(prisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        }),
      );
    });
  });

  describe('findForPdfForUser', () => {
    it('scopes the lookup to the caller, so another buyer reads as missing', async () => {
      prisma.certificate.findFirst.mockResolvedValue(null);

      const document = await repo.findForPdfForUser('cert-1', 'u1');

      expect(document).toBeNull();
      expect(prisma.certificate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cert-1', result: { attempt: { userId: 'u1' } } },
        }),
      );
    });

    it('returns the printable document for the owner', async () => {
      prisma.certificate.findFirst.mockResolvedValue({
        id: 'cert-1',
        number: '060/CPMI/YM/XI/2026',
        revision: 1,
        status: 'ACTIVE',
        snapshot: { holder: 'Budi' },
        verifyCode: 'XMRBDYN7MU',
      });

      const document = await repo.findForPdfForUser('cert-1', 'u1');

      expect(document).toMatchObject({
        id: 'cert-1',
        number: '060/CPMI/YM/XI/2026',
        status: 'ACTIVE',
      });
    });
  });
});
