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
  tests: { testId: string; order: number }[];
}

export interface JoinSessionParams {
  sessionId: string;
  name: string;
  email?: string;
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
  findByToken(token: string): Promise<TestSession | null>;
  findTestsByIds(ids: string[]): Promise<{ id: string; status: string }[]>;
  findInstitutionById(id: string): Promise<{ id: string } | null>;
  createWithTests(params: CreateSessionParams): Promise<TestSession>;
  updateStatus(id: string, status: 'ACTIVE' | 'CLOSED'): Promise<TestSession>;
  findSessionTestsBySessionId(sessionId: string): Promise<SessionTestSummary[]>;
  findParticipantsBySessionId(sessionId: string): Promise<SessionParticipant[]>;
  findAttemptsByParticipantId(
    participantId: string,
  ): Promise<{ id: string; testId: string; testName: string }[]>;
  updateParticipantToken(id: string, tokenHash: string): Promise<void>;
  countParticipants(sessionId: string): Promise<number>;
  findParticipantByTokenHash(
    tokenHash: string,
  ): Promise<SessionParticipant | null>;
  joinSession(params: JoinSessionParams): Promise<JoinSessionResult>;
}
