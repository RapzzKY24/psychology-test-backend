import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { REPORTS_REPOSITORY } from '../repository/reports.repository';
import type {
  ReportCandidate,
  ReportListItem,
  ReportParticipantContext,
  ReportRecord,
  ReportTestItem,
  ReportsRepository,
} from '../repository/reports.repository';
import {
  collectMissingFields,
  validateReportInput,
} from '../utils/validate-report';
import type { ReportInput } from '../utils/validate-report';
import type { QueryReportsDto } from '../dto/query-reports.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';
import { calculateAge } from '../utils/calculate-age';
import { buildReportNumber } from '../utils/build-report-number';
import { testNumberLabel } from '../utils/test-number-label';
import { buildReportSnapshot } from '../utils/report-snapshot';
import { jakartaDateParts } from '../utils/jakarta-date';
import { generateVerifyCode } from '../../reviews/utils/generate-verify-code';
import {
  DEFAULT_INSTITUTION_CODE,
  DEFAULT_INSTITUTION_NAME,
  REPORT_SETTING_KEYS,
} from '../report-settings';
import { isProfileComplete } from '../../psychologist/utils/is-profile-complete';
import type {
  PsychologistProfile,
  Recommendation,
} from '../../../generated/prisma/client';

export interface IssuedReport {
  id: string;
  number: string;
  revision: number;
  status: 'ACTIVE';
  issuedAt: Date;
  verifyCode: string;
}

export interface ReportForm {
  participant: {
    id: string;
    name: string;
    age: number | null;
    education: string | null;
    destination: string | null;
  };
  session: { id: string; title: string };
  tests: ReportTestItem[];
  report: {
    id: string;
    status: string;
    ratings: Record<string, string>;
    narratives: Record<string, string>;
    recommendation: Recommendation | null;
    /** Present once the report is ACTIVE — the UI shows it read-only. */
    number: string | null;
    issuedAt: Date | null;
    updatedAt: Date;
  } | null;
  readiness: {
    testsApproved: boolean;
    profileComplete: boolean;
    missingFields: string[];
  };
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(REPORTS_REPOSITORY)
    private readonly repo: ReportsRepository,
  ) {}

  async listReports(
    query: QueryReportsDto,
  ): Promise<PaginatedResponse<ReportListItem>> {
    const { data, total } = await this.repo.listReports({
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      status: query.status,
      sessionId: query.sessionId,
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
   * The psychologist's work queue: participants whose tests are all approved
   * but who have no report yet. Without this the form would be unreachable —
   * the report list only contains rows that already exist.
   */
  async listPendingReports(
    query: PaginationDto,
  ): Promise<PaginatedResponse<ReportCandidate>> {
    const { data, total } = await this.repo.findReportCandidates({
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
   * Opens the assessment form. Creates the DRAFT row on first open so the
   * psychologist's work is never lost mid-way; an already issued report is
   * returned as-is and never downgraded back to a draft.
   */
  async getForm(userId: string, participantId: string): Promise<ReportForm> {
    const context = await this.requireInstitutionContext(participantId);

    let report = await this.repo.findActiveByParticipant(participantId);
    if (!report) {
      report =
        (await this.repo.findDraftByParticipant(participantId)) ??
        (await this.createDraft(userId, participantId));
    }

    const profile = await this.repo.findPsychologist(userId);
    return this.toForm(context, report, profile);
  }

  async saveDraft(
    userId: string,
    participantId: string,
    input: ReportInput,
  ): Promise<ReportForm> {
    const errors = validateReportInput(input);
    if (errors.length > 0) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'validation_failed',
        error: 'Unprocessable Entity',
        details: errors.map((e) => `${e.field}: ${e.code}`),
      });
    }

    const context = await this.requireInstitutionContext(participantId);
    if (await this.repo.findActiveByParticipant(participantId)) {
      throw new ConflictException('report_already_issued');
    }

    const current =
      (await this.repo.findDraftByParticipant(participantId)) ??
      (await this.createDraft(userId, participantId));

    // Merge rather than replace: a partial save must not wipe the aspects the
    // psychologist already filled in.
    const updated = await this.repo.updateDraft(current.id, {
      ratings: {
        ...current.ratings,
        ...((input.ratings ?? {}) as Record<string, string>),
      },
      narratives: {
        ...current.narratives,
        ...((input.narratives ?? {}) as Record<string, string>),
      },
      recommendation:
        input.recommendation === undefined
          ? current.recommendation
          : (input.recommendation as Recommendation | null),
      filledById: userId,
      filledAt: new Date(),
    });

    const profile = await this.repo.findPsychologist(userId);
    return this.toForm(context, updated, profile);
  }

  /**
   * Issues the report: assigns the number, freezes the snapshot and flips the
   * draft to ACTIVE. Everything printed on the PDF is validated first, so a
   * number is never burned on a document that cannot be rendered.
   */
  async issue(userId: string, participantId: string): Promise<IssuedReport> {
    const context = await this.requireInstitutionContext(participantId);

    if (await this.repo.findActiveByParticipant(participantId)) {
      throw new ConflictException('report_already_issued');
    }

    const draft = await this.repo.findDraftByParticipant(participantId);
    if (!draft) throw new NotFoundException('report_not_started');

    const profile = await this.repo.findPsychologist(userId);
    if (!profile || !isProfileComplete(profile)) {
      throw new UnprocessableEntityException('profile_incomplete');
    }

    const notReady = collectMissingFields({
      ratings: draft.ratings,
      narratives: draft.narratives,
      recommendation: draft.recommendation,
    });
    if (
      context.tests.length === 0 ||
      !context.tests.every((test) => test.status === 'APPROVED')
    ) {
      notReady.push('tests: not_approved');
    }
    if (notReady.length > 0) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'report_not_ready',
        error: 'Unprocessable Entity',
        details: notReady,
      });
    }

    const settings = await this.loadSettings();
    const issuedAt = new Date();
    const { year, month } = jakartaDateParts(issuedAt);
    const revision = await this.repo.nextRevision(participantId);
    // One test in the session means the number can name that test, the same
    // way a certificate does. A multi-test session has no single name, so the
    // session title stays the segment.
    const name =
      context.sessionTestNames.length === 1
        ? testNumberLabel(context.sessionTestNames[0])
        : context.sessionTitle;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const seq = await this.repo.nextSeq(year);
        const number = buildReportNumber({
          seq,
          name,
          institutionCode: settings.institutionCode,
          month,
          year,
        });
        const verifyCode = generateVerifyCode();
        const snapshot = buildReportSnapshot({
          context,
          report: draft,
          profile,
          institutionName: settings.institutionName,
          issuedAt,
        });

        const row = await this.repo.issueDraft(draft.id, {
          number,
          seq,
          year,
          revision,
          verifyCode,
          snapshot,
          issuedAt,
          issuedById: userId,
        });

        return {
          id: row.id,
          number,
          revision,
          status: 'ACTIVE',
          issuedAt,
          verifyCode,
        };
      } catch (error) {
        if ((error as { code?: string })?.code !== 'P2002') throw error;
        // Two issues raced: the loser sees the winner's ACTIVE row.
        if (await this.repo.findActiveByParticipant(participantId)) {
          throw new ConflictException('report_already_issued');
        }
        // Otherwise the number collided — take the next sequence and retry.
      }
    }

    throw new ConflictException('report_issue_conflict');
  }

  private async loadSettings(): Promise<{
    institutionName: string;
    institutionCode: string;
  }> {
    const rows = await this.repo.findSettings([
      REPORT_SETTING_KEYS.institutionName,
      REPORT_SETTING_KEYS.institutionCode,
    ]);
    const pick = (key: string, fallback: string): string => {
      const value = rows[key];
      return typeof value === 'string' && value.trim().length > 0
        ? value.trim()
        : fallback;
    };
    return {
      institutionName: pick(
        REPORT_SETTING_KEYS.institutionName,
        DEFAULT_INSTITUTION_NAME,
      ),
      institutionCode: pick(
        REPORT_SETTING_KEYS.institutionCode,
        DEFAULT_INSTITUTION_CODE,
      ),
    };
  }

  private async requireInstitutionContext(
    participantId: string,
  ): Promise<ReportParticipantContext> {
    const context = await this.repo.findParticipantContext(participantId);
    if (!context) throw new NotFoundException('Participant not found');
    if (!context.institutionId) {
      throw new UnprocessableEntityException('report_institution_only');
    }
    return context;
  }

  /**
   * Two psychologists opening the same participant at once both try to insert a
   * draft; the partial unique index lets exactly one through and the loser
   * simply reads the winner's row.
   */
  private async createDraft(
    userId: string,
    participantId: string,
  ): Promise<ReportRecord> {
    try {
      return await this.repo.createDraft(participantId, {
        ratings: {},
        narratives: {},
        recommendation: null,
        filledById: userId,
        filledAt: new Date(),
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        const existing = await this.repo.findDraftByParticipant(participantId);
        if (existing) return existing;
      }
      throw error;
    }
  }

  private toForm(
    context: ReportParticipantContext,
    report: ReportRecord,
    profile: PsychologistProfile | null,
  ): ReportForm {
    const missingFields = collectMissingFields({
      ratings: report.ratings,
      narratives: report.narratives,
      recommendation: report.recommendation,
    });

    return {
      participant: {
        id: context.participantId,
        name: context.participantName,
        age: calculateAge(context.birthDate, new Date()),
        education: context.education,
        destination: context.destinationCountry,
      },
      session: { id: context.sessionId, title: context.sessionTitle },
      tests: context.tests,
      report: {
        id: report.id,
        status: report.status,
        ratings: report.ratings,
        narratives: report.narratives,
        recommendation: report.recommendation,
        number: report.number,
        issuedAt: report.issuedAt,
        updatedAt: report.updatedAt,
      },
      readiness: {
        testsApproved:
          context.tests.length > 0 &&
          context.tests.every((test) => test.status === 'APPROVED'),
        profileComplete: !!profile && isProfileComplete(profile),
        missingFields,
      },
    };
  }
}
