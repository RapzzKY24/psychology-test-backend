import { MeCertificatesService } from '../service/me-certificates.service';
import type { CertificatesRepository } from '../repository/certificates.repository';
import type { CertificateDocumentService } from '../service/certificate-document.service';

describe('MeCertificatesService', () => {
  let service: MeCertificatesService;
  let repo: { listIssuedByUser: jest.Mock };
  let documents: { renderIssuedForUser: jest.Mock };

  beforeEach(() => {
    repo = {
      listIssuedByUser: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    };
    documents = { renderIssuedForUser: jest.fn() };
    service = new MeCertificatesService(
      repo as unknown as CertificatesRepository,
      documents as unknown as CertificateDocumentService,
    );
  });

  it('scopes the query to the caller and forwards paging', async () => {
    await service.list('u1', { page: 2, limit: 5 });

    expect(repo.listIssuedByUser).toHaveBeenCalledWith({
      userId: 'u1',
      skip: 5,
      take: 5,
    });
  });

  it('returns the rows with pagination meta', async () => {
    const row = {
      id: 'cert-1',
      number: '060/CPMI/YM/XI/2026',
      status: 'ACTIVE' as const,
      testName: 'CPMI',
      issuedAt: new Date('2026-11-04T01:31:45Z'),
      validUntil: null,
      verifyCode: 'XMRBDYN7MU',
    };
    repo.listIssuedByUser.mockResolvedValue({ data: [row], total: 12 });

    const result = await service.list('u1', { page: 1, limit: 10 });

    expect(result.data).toEqual([row]);
    expect(result.meta).toEqual({
      page: 1,
      limit: 10,
      total: 12,
      totalPages: 2,
    });
  });

  it('downloads through the user-scoped renderer, not the unscoped one', async () => {
    const rendered = { buffer: Buffer.from('pdf'), filename: 'cert.pdf' };
    documents.renderIssuedForUser.mockResolvedValue(rendered);

    const result = await service.download('u1', 'cert-1');

    expect(documents.renderIssuedForUser).toHaveBeenCalledWith('cert-1', 'u1');
    expect(result).toBe(rendered);
  });
});
