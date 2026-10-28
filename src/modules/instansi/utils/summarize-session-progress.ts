import type { SessionProgressParticipantRow } from '../repository/instansi-stats.repository';

export interface SessionProgressSummary {
  completed: number;
  inProgress: number;
  notStarted: number;
  empty: number;
}

/**
 * Buckets are exhaustive so the stacked bar always adds up to `slotLimit`:
 * - completed  → has attempts, all of them COMPLETED
 * - inProgress → has attempts, not all COMPLETED (includes ABANDONED-only)
 * - notStarted → on the roster, no attempt yet
 * - empty      → seats that nobody claimed
 */
export function summarizeSessionProgress(
  participants: SessionProgressParticipantRow[],
  slotLimit: number,
): SessionProgressSummary {
  let completed = 0;
  let inProgress = 0;
  let notStarted = 0;

  for (const participant of participants) {
    const statuses = participant.attemptStatuses;
    if (statuses.length === 0) {
      notStarted += 1;
    } else if (statuses.every((status) => status === 'COMPLETED')) {
      completed += 1;
    } else {
      inProgress += 1;
    }
  }

  return {
    completed,
    inProgress,
    notStarted,
    empty: Math.max(0, slotLimit - participants.length),
  };
}
