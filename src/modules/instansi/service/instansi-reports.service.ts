import { Inject, Injectable } from '@nestjs/common';
import { REPORTS_REPOSITORY } from '../../reports/repository/reports.repository';
import type {
  ReportListItem,
  ReportsRepository,
} from '../../reports/repository/reports.repository';
import { ReportDocumentService } from '../../reports/service/report-document.service';
import type { RenderedReport } from '../../reports/service/report-document.service';
import { InstansiParticipantsService } from './instansi-participants.service';
import type { QueryInstansiReportsDto } from '../dto/query-instansi-reports.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';

/** Institution-scoped issued reports — the scope always comes from the caller. */
@Injectable()
export class InstansiReportsService {
  constructor(
    @Inject(REPORTS_REPOSITORY)
    private readonly repo: ReportsRepository,
    private readonly documents: ReportDocumentService,
    private readonly participants: InstansiParticipantsService,
  ) {}

  async list(
    userId: string,
    query: QueryInstansiReportsDto,
  ): Promise<PaginatedResponse<ReportListItem>> {
    const institutionId = await this.participants.resolveInstitutionId(userId);
    const { data, total } = await this.repo.listForInstitution({
      institutionId,
      sessionId: query.sessionId,
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

  async renderPdf(userId: string, reportId: string): Promise<RenderedReport> {
    const institutionId = await this.participants.resolveInstitutionId(userId);
    return this.documents.renderPdf(reportId, { institutionId });
  }
}
