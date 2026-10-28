import type {
  AttemptStatus,
  SessionStatus,
} from '../../../generated/prisma/client';

export const INSTANSI_STATS_REPOSITORY = 'InstansiStatsRepository';

export interface SessionProgressParticipantRow {
  /** Status of every attempt this participant made in the session. */
  attemptStatuses: AttemptStatus[];
}

export interface SessionProgressRow {
  id: string;
  title: string;
  status: SessionStatus;
  slotLimit: number;
  participants: SessionProgressParticipantRow[];
}

export interface InstansiStatsRepository {
  /** Sessions owned by the institution, ACTIVE first, newest first. */
  findSessionProgress(params: {
    institutionId: string;
    limit: number;
  }): Promise<SessionProgressRow[]>;
}
