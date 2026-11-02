import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { REPORTS_REPOSITORY } from '../repository/reports.repository';
import type { ReportsRepository } from '../repository/reports.repository';
import type { ReviseReportDto } from '../dto/revise-report.dto';
import { validateReportInput } from '../utils/validate-report';
import type { ReportSnapshot } from '../utils/report-snapshot';

export interface RevisedReport {
  id: string;
  number: string;
  revision: number;
  status: 'ACTIVE';
  supersedesId: string;
}

@Injectable()
export class AdminReportsService {
  constructor(
    @Inject(REPORTS_REPOSITORY)
    private readonly repo: ReportsRepository,
  ) {}

  /**
   * Corrections are a new revision, not an edit: the number stays, the previous
   * document is marked SUPERSEDED, and the QR code moves to the new row so an
   * already-printed copy still resolves to the current version.
   */
  async revise(
    reportId: string,
    adminUserId: string,
    input: ReviseReportDto,
  ): Promise<RevisedReport> {
    if (!input.reason || input.reason.trim().length < 10) {
      throw new UnprocessableEntityException('reason_too_short');
    }

    const errors = validateReportInput(input);
    if (errors.length > 0) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'validation_failed',
        error: 'Unprocessable Entity',
        details: errors.map((e) => `${e.field}: ${e.code}`),
      });
    }

    const current = await this.repo.findForPdf(reportId);
    if (!current) throw new NotFoundException('report_not_found');
    if (current.status !== 'ACTIVE') {
      throw new ConflictException(`report_${current.status.toLowerCase()}`);
    }

    const ratings = { ...current.snapshot.ratings, ...(input.ratings ?? {}) };
    const narratives = {
      ...current.snapshot.narratives,
      ...(input.narratives ?? {}),
    };
    const recommendation =
      input.recommendation ?? current.snapshot.recommendation;
    const issuedAt = new Date();

    const snapshot: ReportSnapshot = {
      ...current.snapshot,
      ratings,
      narratives,
      recommendation,
      issuedAt: issuedAt.toISOString(),
    };

    const row = await this.repo.supersede(reportId, {
      ratings,
      narratives,
      recommendation,
      snapshot,
      issuedAt,
      issuedById: adminUserId,
      revision: current.revision + 1,
      verifyCode: current.verifyCode,
    });

    return {
      id: row.id,
      number: current.number,
      revision: current.revision + 1,
      status: 'ACTIVE',
      supersedesId: reportId,
    };
  }

  async revoke(
    reportId: string,
    adminUserId: string,
    reason: string,
  ): Promise<{ id: string; status: 'REVOKED'; revokedAt: Date }> {
    if (!reason || reason.trim().length < 10) {
      throw new UnprocessableEntityException('reason_too_short');
    }

    const current = await this.repo.findForPdf(reportId);
    if (!current) throw new NotFoundException('report_not_found');
    if (current.status !== 'ACTIVE') {
      throw new ConflictException(`report_${current.status.toLowerCase()}`);
    }

    const revokedAt = new Date();
    await this.repo.revoke(reportId, {
      reason: reason.trim(),
      revokedAt,
      revokedById: adminUserId,
    });

    return { id: reportId, status: 'REVOKED', revokedAt };
  }
}
