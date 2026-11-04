import type {
  CertificateStatus,
  CertificateVerdict,
  PsychologistProfile,
  ResultStatus,
} from '../../../generated/prisma/client';

export const CERTIFICATES_REPOSITORY = 'CertificatesRepository';

/**
 * The identity block exactly as the certificate prints it. Typed by the
 * psychologist (spec D3): no participant row carries gender, birthplace or
 * address, so these cannot be derived.
 *
 * `birthDate` is an ISO date (YYYY-MM-DD) rather than a timestamp — only the
 * calendar day is printed, and a Date would drag a timezone into it. `age` is
 * stored, not recomputed, because the document must not change as the person
 * has another birthday.
 */
export interface CertificateIdentity {
  fullName: string;
  idNumber: string;
  gender: string;
  birthPlace: string;
  birthDate: string;
  age: number;
  address: string;
}

export const EMPTY_IDENTITY: CertificateIdentity = {
  fullName: '',
  idNumber: '',
  gender: '',
  birthPlace: '',
  birthDate: '',
  age: 0,
  address: '',
};

export interface CertificateRecord {
  id: string;
  resultId: string;
  status: CertificateStatus;
  identity: CertificateIdentity;
  verdict: CertificateVerdict | null;
  purpose: string | null;
  validUntil: Date | null;
  photoPath: string | null;
  /** The psychologist the draft belongs to; set once, at creation. */
  filledById: string | null;
  number: string | null;
  seq: number | null;
  year: number | null;
  revision: number | null;
  /** Set when this row is a correction of an earlier revision. */
  supersedesId: string | null;
  verifyCode: string | null;
  issuedAt: Date | null;
  revokedAt: Date | null;
  /** Present once the row is REVOKED — the printed document is withdrawn. */
  revokeReason: string | null;
  updatedAt: Date;
}

/**
 * Everything the draft editor may change. Only legal while status is DRAFT.
 *
 * `filledById` is not here on purpose: it is the psychologist the draft belongs
 * to, set once at creation. Letting an edit overwrite it would hand ownership
 * to whoever saved last, including an admin.
 */
export interface CertificateDraftPatch {
  identity: CertificateIdentity;
  verdict: CertificateVerdict | null;
  purpose: string | null;
  validUntil: Date | null;
  photoPath: string | null;
  filledAt: Date;
}

export interface CertificateIssuePatch {
  number: string;
  seq: number;
  year: number;
  revision: number;
  verifyCode: string;
  snapshot: unknown;
  issuedAt: Date;
  issuedById: string;
}

export interface CertificateRevokePatch {
  reason: string;
  revokedAt: Date;
  revokedById: string;
}

/** An issued certificate as the PDF renderer needs it. */
export interface CertificateDocument {
  id: string;
  number: string;
  revision: number;
  status: CertificateStatus;
  snapshot: unknown;
  /** Null on a superseded revision, whose QR must stop resolving. */
  verifyCode: string | null;
}

/** What the service needs to decide whether a result may get a certificate. */
export interface CertificateResultContext {
  resultId: string;
  status: ResultStatus;
  testName: string;
  testSlug: string;
  participantName: string | null;
  sessionTitle: string | null;
}

/** An approved result that has no live certificate yet. */
export interface PendingResult {
  resultId: string;
  testName: string;
  testSlug: string;
  /** Null for a personal purchase — there is no participant row. */
  participantName: string | null;
  approvedAt: Date | null;
  sessionTitle: string | null;
}

/** One row of the psychologist's certificate list. */
export interface CertificateListItem {
  id: string;
  number: string | null;
  revision: number | null;
  status: CertificateStatus;
  testName: string;
  /** The name typed on the document, not the participant row. */
  holderName: string;
  issuedAt: Date | null;
  updatedAt: Date;
}

/** Public QR lookup. */
export interface CertificateVerification {
  number: string;
  revision: number;
  status: CertificateStatus;
  snapshot: unknown;
  issuedAt: Date | null;
  revokedAt: Date | null;
  revokeReason: string | null;
}

export interface CertificatesRepository {
  findById(id: string): Promise<CertificateRecord | null>;

  /** Every revision of a result, newest first. */
  findByResult(resultId: string): Promise<CertificateRecord[]>;

  /** The editable draft for a result, if the psychologist already started one. */
  findDraftForResult(resultId: string): Promise<CertificateRecord | null>;

  findResultContext(resultId: string): Promise<CertificateResultContext | null>;

  /** `ownerId` becomes `filledById` — the psychologist the draft belongs to. */
  createDraft(
    resultId: string,
    ownerId: string,
    at: Date,
  ): Promise<CertificateRecord>;

  /**
   * Opens a draft that corrects an existing certificate. The content and the
   * number are copied so the psychologist only edits what is wrong; the source
   * stays ACTIVE until this draft is issued.
   */
  createRevisionDraft(
    source: CertificateRecord,
    ownerId: string,
    at: Date,
  ): Promise<CertificateRecord>;

  updateDraft(
    id: string,
    patch: CertificateDraftPatch,
  ): Promise<CertificateRecord>;

  /** Only touches the photo, so it cannot clobber a concurrent text edit. */
  setPhoto(id: string, photoPath: string | null): Promise<CertificateRecord>;

  /**
   * Assigns the number and freezes the snapshot. Re-checks the status inside
   * the transaction, so a double submit cannot issue twice.
   */
  issue(id: string, patch: CertificateIssuePatch): Promise<CertificateRecord>;

  revoke(id: string, patch: CertificateRevokePatch): Promise<CertificateRecord>;

  findForPdf(id: string): Promise<CertificateDocument | null>;

  /** Same row, but only when the result belongs to this institution. */
  findForPdfInInstitution(
    id: string,
    institutionId: string,
  ): Promise<CertificateDocument | null>;

  /**
   * Approved, non-WPT results with no DRAFT or ACTIVE certificate. Oldest
   * first, so a partial run still makes progress.
   */
  findPendingResults(params: {
    skip: number;
    take: number;
  }): Promise<{ data: PendingResult[]; total: number }>;

  /** Newest first. Drafts are included so an abandoned draft stays reachable. */
  listCertificates(params: {
    skip: number;
    take: number;
    ownerId?: string;
    status?: CertificateStatus;
  }): Promise<{ data: CertificateListItem[]; total: number }>;

  /**
   * Only rows that still carry a verify code are reachable: a superseded
   * revision has its code cleared, so a QR always lands on the valid revision.
   */
  findByVerifyCode(code: string): Promise<CertificateVerification | null>;

  /** Next free sequence for the year. 60 when the year is empty. */
  nextSeq(year: number): Promise<number>;

  /** Revision counter for a result, so a re-issue never reuses revision 1. */
  nextRevision(resultId: string): Promise<number>;

  findPsychologist(userId: string): Promise<PsychologistProfile | null>;

  findSettings(keys: readonly string[]): Promise<Record<string, unknown>>;
}
