import type { TestResult } from '../../../generated/prisma/client';

export interface AttemptReadItemDto {
  id: string;
  order: number;
  content: Record<string, unknown>;
}

export interface AttemptReadResponseDto {
  itemId: string;
  value: unknown;
}

export interface AttemptReadDto {
  id: string;
  sessionId: string;
  testId: string;
  testName: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  items: AttemptReadItemDto[];
  responses: AttemptReadResponseDto[];
}

export interface AttemptCompleteResponseDto {
  id: string;
  testId: string;
  testName: string;
  status: string;
  completedAt: Date;
  result: TestResult;
}
