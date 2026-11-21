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
  /**
   * Every test attached to the session, not just the ones this participant
   * attempted. A one-test session lets the report number carry that test's
   * short label instead of the session title.
   */
  sessionTestNames: string[];
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
  /** Filled once the draft is issued; null while it is still a draft. */
  number: string | null;
  issuedAt: Date | null;
  updatedAt: Date;
}

export interface ReportDraftPatch {
  ratings: Record<string, string>;
  narratives: Record<string, string>;
  recommendation: Recommendation | null;
  /** Null for drafts created by a backfill — no psychologist has filled them. */
  filledById: string | null;
  filledAt: Date;
}

export interface ReportListItem {
  id: string;
  participantId: string;
  participantName: string;
  sessionId: string;
  sessionTitle: string;
  number: string | null;
  revision: number | null;
  status: ReportStatus;
  issuedAt: Date | null;
  testsApproved: number;
  testsTotal: number;
}

export interface ReportCandidate {
  participantId: string;
  participantName: string;
  sessionId: string;
  sessionTitle: string;
  testsApproved: number;
  testsTotal: number;
}

export interface ReportDocument {
  id: string;
  participantId: string;
  number: string;
  revision: number;
  verifyCode: string;
  status: ReportStatus;
  snapshot: ReportSnapshot;
}

export interface ReportRevisionPatch {
  ratings: Record<string, string>;
  narratives: Record<string, string>;
  recommendation: Recommendation;
  snapshot: ReportSnapshot;
  issuedAt: Date;
  issuedById: string;
  revision: number;
  verifyCode: string;
}

export interface ReportVerification {
  number: string;
  revision: number;
  status: ReportStatus;
  snapshot: ReportSnapshot;
  issuedAt: Date | null;
  revokedAt: Date | null;
  revokeReason: string | null;
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

  listReports(params: {
    skip: number;
    take: number;
    status?: ReportStatus;
    sessionId?: string;
  }): Promise<{ data: ReportListItem[]; total: number }>;
  findForPdf(id: string): Promise<ReportDocument | null>;

  listForInstitution(params: {
    institutionId: string;
    sessionId?: string;
    skip: number;
    take: number;
  }): Promise<{ data: ReportListItem[]; total: number }>;
  findForPdfInInstitution(
    id: string,
    institutionId: string,
  ): Promise<ReportDocument | null>;

  /**
   * Participants of institution sessions whose tests are all approved but who
   * have no report row yet. Feeds both the psychologist's work queue and the
   * admin backfill, so the two can never disagree about who is pending.
   * Ordered oldest first so a partial run still makes progress.
   */
  findReportCandidates(params: {
    sessionId?: string;
    skip?: number;
    take?: number;
  }): Promise<{ data: ReportCandidate[]; total: number }>;

  /**
   * Public QR lookup. Only rows carrying a verify code are reachable: a
   * superseded revision has its code cleared, so the QR always lands on the
   * revision that is currently valid.
   */
  findByVerifyCode(code: string): Promise<ReportVerification | null>;

  /** Marks the current revision SUPERSEDED and inserts the next one. */
  supersede(id: string, patch: ReportRevisionPatch): Promise<ReportRecord>;
  revoke(
    id: string,
    patch: { reason: string; revokedAt: Date; revokedById: string },
  ): Promise<ReportRecord>;
}
