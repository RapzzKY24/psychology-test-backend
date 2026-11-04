import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ReportPdfService } from '../../reports/pdf/report-pdf.service';
import {
  CertificateAssetError,
  CertificateAssetsService,
} from '../pdf/certificate-assets';
import { renderCertificateHtml } from '../pdf/certificate-html';
import type { CertificateAssets } from '../pdf/certificate-html';
import { CERTIFICATES_REPOSITORY } from '../repository/certificates.repository';
import type { CertificatesRepository } from '../repository/certificates.repository';
import { certificateFileName } from '../utils/certificate-filename';
import type {
  CertificateSnapshot,
  CertificateView,
} from '../utils/certificate-snapshot';

export interface RenderedCertificate {
  buffer: Buffer;
  filename: string;
}

@Injectable()
export class CertificateDocumentService {
  constructor(
    @Inject(CERTIFICATES_REPOSITORY)
    private readonly repo: CertificatesRepository,
    private readonly assets: CertificateAssetsService,
    private readonly pdf: ReportPdfService,
  ) {}

  /**
   * Only an ACTIVE certificate renders. A revoked one must not produce a fresh
   * document that looks valid, and a superseded revision would contradict the
   * one that replaced it.
   */
  async renderIssued(id: string): Promise<RenderedCertificate> {
    const document = await this.repo.findForPdf(id);
    if (!document) throw new NotFoundException('certificate_not_found');
    if (document.status !== 'ACTIVE') {
      throw new ConflictException(
        `certificate_${document.status.toLowerCase()}`,
      );
    }

    const snapshot = document.snapshot as CertificateSnapshot;
    const buffer = await this.renderDocument(snapshot, {
      verifyCode: document.verifyCode,
      draft: false,
    });
    return { buffer, filename: certificateFileName(document.number) };
  }

  /**
   * The same document, for an institution that may read but not issue: the row
   * must belong to one of its sessions, otherwise it is simply not found.
   */
  async renderIssuedForInstitution(
    id: string,
    institutionId: string,
  ): Promise<RenderedCertificate> {
    const document = await this.repo.findForPdfInInstitution(id, institutionId);
    if (!document) throw new NotFoundException('certificate_not_found');
    if (document.status !== 'ACTIVE') {
      throw new ConflictException(
        `certificate_${document.status.toLowerCase()}`,
      );
    }

    const snapshot = document.snapshot as CertificateSnapshot;
    const buffer = await this.renderDocument(snapshot, {
      verifyCode: document.verifyCode,
      draft: false,
    });
    return { buffer, filename: certificateFileName(document.number) };
  }

  /**
   * Draws one page from a view. Shared by the issued document and the draft
   * preview so the two can never drift apart.
   */
  async renderDocument(
    view: CertificateView,
    options: { verifyCode: string | null; draft: boolean },
  ): Promise<Buffer> {
    let assets: CertificateAssets;
    try {
      assets = await this.assets.build({
        verifyCode: options.verifyCode,
        photoPath: view.photoPath,
        signaturePath: view.issuer.signaturePath || null,
      });
    } catch (error) {
      if (error instanceof CertificateAssetError) {
        throw new InternalServerErrorException(error.code);
      }
      throw error;
    }

    const html = renderCertificateHtml({
      snapshot: view,
      assets,
      draft: options.draft,
    });
    return this.pdf.render(html);
  }
}
