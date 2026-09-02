import type { TestSession } from '../../../generated/prisma/client';

export const SESSIONS_REPOSITORY = 'SessionsRepository';

export interface SessionTestsSummary {
  total: number;
  inProgress: number;
  completed: number;
}

export interface SessionDetail {
  session: TestSession;
  tests: { id: string; testId: string; testName: string; order: number }[];
  participants: number;
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
}
