import type {
  PsychologistProfile,
  Recommendation,
} from '../../../generated/prisma/client';
import type {
  ReportParticipantContext,
  ReportRecord,
} from '../repository/reports.repository';
import { calculateAge } from './calculate-age';
import { jakartaIsoDate } from './jakarta-date';

export interface ReportSnapshot {
  holder: {
    name: string;
    age: number | null;
    education: string | null;
    destination: string | null;
  };
  session: { id: string; title: string };
  tests: { name: string; patternCode: string | null }[];
  assessor: {
    fullName: string;
    degree: string;
    licenseNumber: string;
    sippNumber: string | null;
    signaturePath: string;
  };
  institution: string;
  ratings: Record<string, string>;
  narratives: Record<string, string>;
  recommendation: Recommendation;
  examDate: string;
  issuedAt: string;
}

export interface BuildSnapshotParams {
  context: ReportParticipantContext;
  report: ReportRecord;
  profile: PsychologistProfile;
  institutionName: string;
  issuedAt: Date;
}

function latestCompletedAt(context: ReportParticipantContext): Date | null {
  let latest: Date | null = null;
  for (const test of context.tests) {
    if (test.completedAt && (!latest || test.completedAt > latest)) {
      latest = test.completedAt;
    }
  }
  return latest;
}

/**
 * Freezes everything the PDF prints. Once written, editing the participant,
 * swapping the psychologist signature or renaming the session must not change
 * a report that is already circulating.
 */
export function buildReportSnapshot(
  params: BuildSnapshotParams,
): ReportSnapshot {
  const { context, report, profile, institutionName, issuedAt } = params;

  if (!report.recommendation) {
    throw new Error('buildReportSnapshot requires a recommendation');
  }

  return {
    holder: {
      name: context.participantName,
      age: calculateAge(context.birthDate, issuedAt),
      education: context.education,
      destination: context.destinationCountry,
    },
    session: { id: context.sessionId, title: context.sessionTitle },
    tests: context.tests.map((test) => ({
      name: test.testName,
      patternCode: test.patternCode,
    })),
    assessor: {
      fullName: profile.fullName,
      degree: profile.degree,
      licenseNumber: profile.licenseNumber,
      sippNumber: profile.sippNumber ?? null,
      signaturePath: profile.signatureImagePath,
    },
    institution: institutionName,
    ratings: report.ratings,
    narratives: report.narratives,
    recommendation: report.recommendation,
    examDate: jakartaIsoDate(latestCompletedAt(context) ?? issuedAt),
    issuedAt: issuedAt.toISOString(),
  };
}
