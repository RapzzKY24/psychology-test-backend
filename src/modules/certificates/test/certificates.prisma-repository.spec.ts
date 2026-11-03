import { PrismaCertificatesRepository } from '../repository/certificates.prisma-repository';
import type { PrismaService } from '../../../prisma/prisma.service';

describe('PrismaCertificatesRepository', () => {
  let repo: PrismaCertificatesRepository;
  let prisma: { certificate: { aggregate: jest.Mock } };

  beforeEach(() => {
    prisma = { certificate: { aggregate: jest.fn() } };
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
});
