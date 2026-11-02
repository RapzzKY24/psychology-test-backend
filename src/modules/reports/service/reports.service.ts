import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { REPORTS_REPOSITORY } from '../repository/reports.repository';
import type {
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
import { calculateAge } from '../utils/calculate-age';
import { isProfileComplete } from '../../psychologist/utils/is-profile-complete';
import type {
  PsychologistProfile,
  Recommendation,
} from '../../../generated/prisma/client';

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
