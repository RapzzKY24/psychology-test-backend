import type {
  SessionParticipant,
  TestSession,
} from '../../../generated/prisma/client';

export const SESSIONS_REPOSITORY = 'SessionsRepository';

export interface SessionTestsSummary {
  total: number;
  inProgress: number;
  completed: number;
}

export interface SessionDetail {
  session: TestSession;
  tests: { id: string; testId: string; testName: string; order: number }[];
  participants: Array<{
    id: string;
    name: string;
    email: string | null;
    candidateNumber: string | null;
    joinedAt: Date;
  }>;
  attempts: SessionTestsSummary;
}

export interface CreateSessionParams {
  kind: 'GROUP' | 'INDIVIDUAL';
  title: string;
  institutionId?: string;
  createdById?: string;
  token: string;
  pinHash?: string;
  slotLimit: number;
  expiresAt: Date;
  joinMode: 'OPEN' | 'ROSTER';
  status?: 'PENDING_PAYMENT' | 'ACTIVE';
  tests: { testId: string; order: number }[];
  roster: {
    name: string;
    candidateNumber: string | null;
    institutionParticipantId?: string | null;
  }[];
}

export interface JoinSessionParams {
  sessionId: string;
  name: string;
  email?: string;
  phone?: string;
  candidateNumber?: string;
  participantToken: string;
  tokenHash: string;
}

export interface JoinSessionResult {
  participant: Omit<SessionParticipant, 'tokenHash'>;
  participantToken: string;
  attempts: { id: string; testId: string; testName: string }[];
  /** True when an existing participant resumed (token re-issued, no duplicate). */
  resumed: boolean;
}

export interface NeedsConfirmationResult {
  status: 'needs_confirmation';
  matches: {
    id: string;
    name: string;
    startedAt: Date | null;
    answeredCount: number;
  }[];
}

export interface SessionTestSummary {
  testId: string;
  testName: string;
  testStatus: string;
  order: number;
}

export interface SessionsRepository {
  findById(id: string): Promise<TestSession | null>;
  findDetailById(id: string): Promise<SessionDetail | null>;
  findMany(params: {
    skip: number;
    take: number;
  }): Promise<{ data: TestSession[]; total: number }>;
  findManyByInstitution(
    institutionId: string,
    params: { skip: number; take: number },
  ): Promise<{ data: TestSession[]; total: number }>;
  countSessionsByInstitution(institutionId: string): Promise<number>;
  getAttemptStatsByInstitution(
    institutionId: string,
  ): Promise<SessionTestsSummary>;
  findByToken(token: string): Promise<TestSession | null>;
  findTestsByIds(ids: string[]): Promise<{ id: string; status: string }[]>;
  findInstitutionById(id: string): Promise<{ id: string } | null>;
  createWithTests(params: CreateSessionParams): Promise<TestSession>;
  updateStatus(id: string, status: 'ACTIVE' | 'CLOSED'): Promise<TestSession>;
  findSessionTestsBySessionId(sessionId: string): Promise<SessionTestSummary[]>;
  findParticipantsBySessionId(sessionId: string): Promise<SessionParticipant[]>;
  findAttemptsByParticipantId(
    participantId: string,
  ): Promise<
    { id: string; testId: string; testName: string; startedAt: Date | null }[]
  >;
  countResponsesByParticipantId(participantId: string): Promise<number>;
  updateParticipantToken(
    id: string,
    tokenHash: string,
    claimedAt?: Date,
  ): Promise<void>;
  countParticipants(sessionId: string): Promise<number>;
  createParticipants(
    sessionId: string,
    rows: {
      name: string;
      candidateNumber?: string | null;
      institutionParticipantId?: string | null;
    }[],
  ): Promise<number>;
  updateParticipant(
    id: string,
    data: { name?: string; institutionParticipantId?: string | null },
  ): Promise<SessionParticipant>;
  deleteParticipant(id: string): Promise<void>;
  /** Releases the seat lock (clears tokenHash; keeps claimedAt for audit). */
  resetParticipantToken(id: string): Promise<SessionParticipant>;
  /** Returns false when the seat was already locked by another device. */
  claimSeatWithAttempts(params: {
    seatId: string;
    tokenHash: string;
    claimedAt: Date;
    sessionId: string;
    testIds: string[];
  }): Promise<boolean>;
  findParticipantByTokenHash(
    tokenHash: string,
  ): Promise<SessionParticipant | null>;
  joinSession(params: JoinSessionParams): Promise<JoinSessionResult>;
}
