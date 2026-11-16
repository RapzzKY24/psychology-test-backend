import { Inject, Injectable } from '@nestjs/common';
import { CERTIFICATES_REPOSITORY } from '../repository/certificates.repository';
import type { CertificatesRepository } from '../repository/certificates.repository';
import { CertificateDocumentService } from './certificate-document.service';
import type { RenderedCertificate } from './certificate-document.service';
import type { MeCertificateItemDto } from '../dto/me-certificate.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';

/**
 * The buyer's own issued certificates (participant dashboard, "Sertifikat"
 * tab). Everything is scoped by the session user: an id from the client is
 * never trusted on its own.
 */
@Injectable()
export class MeCertificatesService {
  constructor(
    @Inject(CERTIFICATES_REPOSITORY)
    private readonly repo: CertificatesRepository,
    private readonly documents: CertificateDocumentService,
  ) {}

  async list(
    userId: string,
    query: PaginationDto,
  ): Promise<PaginatedResponse<MeCertificateItemDto>> {
    const { data, total } = await this.repo.listIssuedByUser({
      userId,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /**
   * The signed page. A revoked certificate is listed but not printable, so the
   * document service refuses it with the same 409 the psychologist route uses.
   */
  download(userId: string, id: string): Promise<RenderedCertificate> {
    return this.documents.renderIssuedForUser(id, userId);
  }
}
