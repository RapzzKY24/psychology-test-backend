import type {
  CertificateVerdict,
  PsychologistProfile,
} from '../../../generated/prisma/client';
import { jakartaIsoDate } from '../../reports/utils/jakarta-date';
import type {
  CertificateIdentity,
  CertificateRecord,
  CertificateResultContext,
} from '../repository/certificates.repository';

/**
 * Everything the PDF draws, frozen at issue time.
 *
 * A reprint must show the document that was signed. Reading the live rows
 * instead would silently change a certificate that is already circulating:
 * the psychologist could edit their SIPP number, or the test could be renamed,
 * and last month's printout would no longer match the paper in someone's hand.
 */
export interface CertificateIssuer {
  fullName: string;
  degree: string;
  sippNumber: string | null;
  signaturePath: string;
}

/**
 * Everything the renderer draws, with the fields a draft may not have filled
 * yet left open. A snapshot is a view that happens to be complete; the
 * renderer only ever needs this.
 */
export interface CertificateView {
  holder: CertificateIdentity;
  test: { name: string; slug: string };
  verdict: CertificateVerdict | null;
  purpose: string;
  /** ISO date (YYYY-MM-DD). */
  validUntil: string;
  issuer: CertificateIssuer;
  photoPath: string | null;
  number: string;
  city: string;
  /** ISO date (YYYY-MM-DD), the day printed above the signature. */
  issuedOn: string;
  issuedAt: string;
}

/** The frozen payload stored on an issued row: no field is optional. */
export interface CertificateSnapshot extends CertificateView {
  verdict: CertificateVerdict;
  photoPath: string;
  number: string;
}

export interface BuildCertificateSnapshotParams {
  context: CertificateResultContext;
  draft: CertificateRecord;
  profile: PsychologistProfile;
  city: string;
  number: string;
  issuedAt: Date;
}

export function buildCertificateSnapshot(
  params: BuildCertificateSnapshotParams,
): CertificateSnapshot {
  const { context, draft, profile, city, number, issuedAt } = params;

  // The caller has already refused to issue an incomplete draft; asserting it
  // here keeps the snapshot honest if that check ever moves.
  if (
    !draft.verdict ||
    !draft.purpose ||
    !draft.validUntil ||
    !draft.photoPath
  ) {
    throw new Error('certificate_snapshot_incomplete');
  }

  return {
    holder: { ...draft.identity },
    test: { name: context.testName, slug: context.testSlug },
    verdict: draft.verdict,
    purpose: draft.purpose,
    validUntil: jakartaIsoDate(draft.validUntil),
    issuer: {
      fullName: profile.fullName,
      degree: profile.degree,
      sippNumber: profile.sippNumber ?? null,
      signaturePath: profile.signatureImagePath,
    },
    photoPath: draft.photoPath,
    number,
    city,
    issuedOn: jakartaIsoDate(issuedAt),
    issuedAt: issuedAt.toISOString(),
  };
}

export interface BuildPreviewSnapshotParams {
  record: CertificateRecord;
  context: CertificateResultContext;
  profile: PsychologistProfile | null;
  city: string;
  at: Date;
}

/**
 * The same document drawn from live rows instead of a frozen snapshot, so the
 * psychologist can see what they are about to publish. Missing values render
 * blank instead of failing: an incomplete draft is exactly what a preview is
 * for.
 */
export function buildPreviewSnapshot(
  params: BuildPreviewSnapshotParams,
): CertificateView {
  const { record, context, profile, city, at } = params;
  return {
    holder: { ...record.identity },
    test: { name: context.testName, slug: context.testSlug },
    verdict: record.verdict,
    purpose: record.purpose ?? '',
    validUntil: record.validUntil ? jakartaIsoDate(record.validUntil) : '',
    issuer: {
      fullName: profile?.fullName ?? '',
      degree: profile?.degree ?? '',
      sippNumber: profile?.sippNumber ?? null,
      signaturePath: profile?.signatureImagePath ?? '',
    },
    photoPath: record.photoPath,
    number: record.number ?? '',
    city,
    issuedOn: jakartaIsoDate(at),
    issuedAt: at.toISOString(),
  };
}
