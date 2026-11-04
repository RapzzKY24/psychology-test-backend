import { Injectable } from '@nestjs/common';
import { CertificateDocumentService } from '../../certificates/service/certificate-document.service';
import type { RenderedCertificate } from '../../certificates/service/certificate-document.service';
import { InstansiParticipantsService } from './instansi-participants.service';

/**
 * Institutions read certificates; they never issue, edit or revoke one. The
 * scope is the caller's institution, so an id from another tenant is not found
 * rather than forbidden — the id must not leak its existence.
 */
@Injectable()
export class InstansiCertificatesService {
  constructor(
    private readonly documents: CertificateDocumentService,
    private readonly participants: InstansiParticipantsService,
  ) {}

  async downloadPdf(
    userId: string,
    certificateId: string,
  ): Promise<RenderedCertificate> {
    const institutionId = await this.participants.resolveInstitutionId(userId);
    return this.documents.renderIssuedForInstitution(
      certificateId,
      institutionId,
    );
  }
}
