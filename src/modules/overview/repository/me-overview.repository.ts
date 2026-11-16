export const ME_OVERVIEW_REPOSITORY = 'MeOverviewRepository';

/** An unfinished attempt the participant can still open. */
export interface ActiveAttemptSummary {
  attemptId: string;
  testName: string;
  startedAt: Date;
}

/** A released result, as the dashboard's activity list shows it. */
export interface LatestResultSummary {
  attemptId: string;
  testName: string;
  patternCode: string;
  approvedAt: Date | null;
}

/** An issued certificate, without the PDF or the identity block. */
export interface LatestCertificateSummary {
  id: string;
  number: string;
  testName: string;
  issuedAt: Date;
}

export interface MeOverviewCounts {
  inProgress: number;
  awaitingReview: number;
  resultsReady: number;
  certificatesReady: number;
}

export interface MeOverviewData {
  counts: MeOverviewCounts;
  activeAttempts: ActiveAttemptSummary[];
  latestResults: LatestResultSummary[];
  latestCertificates: LatestCertificateSummary[];
}

/**
 * A read model that spans attempts, results and certificates. It is one
 * repository on purpose: splitting it across the three domain repositories
 * would make the dashboard call six methods to build one screen.
 */
export interface MeOverviewRepository {
  forUser(userId: string): Promise<MeOverviewData>;
}
