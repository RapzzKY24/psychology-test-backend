import { NotFoundException } from '@nestjs/common';
import { InstansiCertificatesService } from '../service/instansi-certificates.service';
import type { CertificateDocumentService } from '../../certificates/service/certificate-document.service';
import type { InstansiParticipantsService } from '../service/instansi-participants.service';

describe('InstansiCertificatesService', () => {
  let service: InstansiCertificatesService;
  let documents: jest.Mocked<
    Pick<CertificateDocumentService, 'renderIssuedForInstitution'>
  >;
  let participants: jest.Mocked<
    Pick<InstansiParticipantsService, 'resolveInstitutionId'>
  >;

  beforeEach(() => {
    documents = { renderIssuedForInstitution: jest.fn() };
    participants = { resolveInstitutionId: jest.fn() };
    service = new InstansiCertificatesService(
      documents as unknown as CertificateDocumentService,
      participants as unknown as InstansiParticipantsService,
    );
  });

  it("scopes the render to the caller's institution", async () => {
    participants.resolveInstitutionId.mockResolvedValue('inst-1');
    documents.renderIssuedForInstitution.mockResolvedValue({
      buffer: Buffer.from('%PDF'),
      filename: 'Sertifikat-060.pdf',
    });

    await service.downloadPdf('user-1', 'cert-1');

    expect(participants.resolveInstitutionId).toHaveBeenCalledWith('user-1');
    expect(documents.renderIssuedForInstitution).toHaveBeenCalledWith(
      'cert-1',
      'inst-1',
    );
  });

  it('passes a certificate from another institution through as not found', async () => {
    participants.resolveInstitutionId.mockResolvedValue('inst-1');
    documents.renderIssuedForInstitution.mockRejectedValue(
      new NotFoundException('certificate_not_found'),
    );

    await expect(service.downloadPdf('user-1', 'cert-x')).rejects.toThrow(
      NotFoundException,
    );
  });
});
