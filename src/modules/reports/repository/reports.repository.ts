import type {
  PsychologistProfile,
  Recommendation,
  ReportStatus,
} from '../../../generated/prisma/client';
import type { ReportSnapshot } from '../utils/report-snapshot';

export const REPORTS_REPOSITORY = 'ReportsRepository';

export interface ReportTestItem {
  testName: string;
  /** Effective pattern: corrected value wins over the system value. */
  patternCode: string | null;
  status: string;
  completedAt: Date | null;
}

export interface ReportParticipantContext {
  participantId: string;
  participantName: string;
  sessionId: string;
  sessionTitle: string;
  /** Null for individual sessions — reports only exist for institutions. */
  institutionId: string | null;
  birthDate: Date | null;
  education: string | null;
  destinationCountry: string | null;
  tests: ReportTestItem[];
}

export interface ReportRecord {
  id: string;
  participantId: string;
  status: ReportStatus;
  /** Rating key → R/K/C/B/T. */
  ratings: Record<string, string>;
  /** Narrative key → text. */
  narratives: Record<string, string>;
  recommendation: Recommendation | null;
  updatedAt: Date;
}

export interface ReportDraftPatch {
  ratings: Record<string, string>;
  narratives: Record<string, string>;
  recommendation: Recommendation | null;
  filledById: string;
  filledAt: Date;
}

export interface ReportIssuePatch {
  number: string;
  seq: number;
  year: number;
  revision: number;
  verifyCode: string;
  snapshot: ReportSnapshot;
  issuedAt: Date;
  issuedById: string;
}

export interface ReportsRepository {
  findParticipantContext(
    participantId: string,
  ): Promise<ReportParticipantContext | null>;
  findDraftByParticipant(participantId: string): Promise<ReportRecord | null>;
  findActiveByParticipant(participantId: string): Promise<ReportRecord | null>;
  createDraft(
    participantId: string,
    patch: ReportDraftPatch,
  ): Promise<ReportRecord>;
  updateDraft(id: string, patch: ReportDraftPatch): Promise<ReportRecord>;
  findPsychologist(userId: string): Promise<PsychologistProfile | null>;

  /** Next free sequence number for the given year (50 when the year is empty). */
  nextSeq(year: number): Promise<number>;
  /** Revision counter for a participant, so a re-issue never reuses revision 1. */
  nextRevision(participantId: string): Promise<number>;
  issueDraft(id: string, patch: ReportIssuePatch): Promise<ReportRecord>;
  findSettings(keys: readonly string[]): Promise<Record<string, unknown>>;
}
