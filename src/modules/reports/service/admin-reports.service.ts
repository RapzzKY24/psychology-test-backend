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
import type { BackfillReportsDto } from '../dto/backfill-reports.dto';
import { validateReportInput } from '../utils/validate-report';
import type { ReportSnapshot } from '../utils/report-snapshot';

export interface BackfillResult {
  /** Participants found eligible but without a report row. */
  scanned: number;
  created: number;
  /** Lost a race to a psychologist who opened the form first. */
  skipped: number;
  dryRun: boolean;
}

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

  /**
   * Creates the missing DRAFT rows for participants who finished before this
   * feature existed. Idempotent by construction: the candidate query excludes
   * anyone who already has any report row, so a second run creates nothing.
   */
  async backfill(input: BackfillReportsDto): Promise<BackfillResult> {
    const { data: candidates } = await this.repo.findReportCandidates({
      sessionId: input.sessionId,
    });

    if (input.dryRun) {
      return {
        scanned: candidates.length,
        created: 0,
        skipped: 0,
        dryRun: true,
      };
    }

    let created = 0;
    let skipped = 0;
    for (const candidate of candidates) {
      try {
        await this.repo.createDraft(candidate.participantId, {
          ratings: {},
          narratives: {},
          recommendation: null,
          // Nobody has filled this yet, and an admin id may not be a uuid.
          filledById: null,
          filledAt: new Date(),
        });
        created += 1;
      } catch (error) {
        // A psychologist opened the form between the scan and this insert; the
        // partial unique index rejects the second draft and that is fine.
        if ((error as { code?: string })?.code === 'P2002') {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }

    return { scanned: candidates.length, created, skipped, dryRun: false };
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
