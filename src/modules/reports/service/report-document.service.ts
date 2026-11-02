import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { REPORTS_REPOSITORY } from '../repository/reports.repository';
import type { ReportsRepository } from '../repository/reports.repository';
import { ReportAssetError, ReportAssetsService } from '../pdf/report-assets';
import { ReportPdfService } from '../pdf/report-pdf.service';
import { renderReportHtml } from '../pdf/report-html';
import type { ReportAssets } from '../pdf/report-html';
import { reportFileName } from '../utils/report-filename';

export interface RenderedReport {
  buffer: Buffer;
  filename: string;
}

@Injectable()
export class ReportDocumentService {
  constructor(
    @Inject(REPORTS_REPOSITORY)
    private readonly repo: ReportsRepository,
    private readonly assets: ReportAssetsService,
    private readonly pdf: ReportPdfService,
  ) {}

  /**
   * Only ACTIVE reports render. A revoked report must not produce a fresh
   * document that looks valid, and a superseded one would contradict the
   * revision that replaced it.
   */
  async renderPdf(
    reportId: string,
    options?: { institutionId?: string },
  ): Promise<RenderedReport> {
    const document = options?.institutionId
      ? await this.repo.findForPdfInInstitution(reportId, options.institutionId)
      : await this.repo.findForPdf(reportId);

    if (!document) {
      // An institution asking for someone else's report gets a 403, never a 404
      // — otherwise the status code leaks which report ids exist.
      if (options?.institutionId) {
        throw new ForbiddenException('report_not_found');
      }
      throw new NotFoundException('report_not_found');
    }
    if (document.status !== 'ACTIVE') {
      throw new ConflictException(`report_${document.status.toLowerCase()}`);
    }

    let assets: ReportAssets;
    try {
      assets = await this.assets.build({
        verifyCode: document.verifyCode,
        signaturePath: document.snapshot.assessor.signaturePath,
      });
    } catch (error) {
      if (error instanceof ReportAssetError) {
        throw new InternalServerErrorException(error.code);
      }
      throw error;
    }

    const html = renderReportHtml({
      snapshot: document.snapshot,
      number: document.number,
      assets,
    });

    return {
      buffer: await this.pdf.render(html),
      filename: reportFileName(document.number),
    };
  }
}
