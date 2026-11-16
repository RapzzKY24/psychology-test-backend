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
  /** Unpaid orders that have not expired yet — the dashboard's "Bayar" shortcut. */
  pendingOrders: number;
}

/** A paid order, for the "pembayaran diterima" line in the activity list. */
export interface LatestOrderSummary {
  orderId: string;
  testName: string;
  amount: number;
  paidAt: Date;
}

/** An unpaid order the participant can still settle from the dashboard. */
export interface UnpaidOrderSummary {
  orderId: string;
  testName: string;
  amount: number;
  createdAt: Date;
  expiresAt: Date;
}

/** A finished attempt whose result has not been approved yet. */
export interface CompletedAttemptSummary {
  attemptId: string;
  testName: string;
  completedAt: Date;
}

export interface MeOverviewData {
  counts: MeOverviewCounts;
  activeAttempts: ActiveAttemptSummary[];
  latestResults: LatestResultSummary[];
  latestCertificates: LatestCertificateSummary[];
  latestOrders: LatestOrderSummary[];
  latestUnpaidOrders: UnpaidOrderSummary[];
  latestCompletedAttempts: CompletedAttemptSummary[];
}

/**
 * A read model that spans attempts, orders, results and certificates. It is
 * one repository on purpose: splitting it across the domain repositories
 * would make the dashboard call eight methods to build one screen.
 */
export interface MeOverviewRepository {
  forUser(userId: string): Promise<MeOverviewData>;
}
