import { z } from 'zod';
import { SessionStatus } from '../../../generated/prisma/client';

export const SessionProgressQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export type SessionProgressQueryDto = z.infer<
  typeof SessionProgressQuerySchema
>;

export const SessionProgressItemSchema = z.object({
  sessionId: z.string().uuid(),
  title: z.string(),
  status: z.nativeEnum(SessionStatus),
  slotLimit: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  notStarted: z.number().int().nonnegative(),
  empty: z.number().int().nonnegative(),
});

export const InstansiSessionProgressStatsSchema = z.object({
  sessions: z.array(SessionProgressItemSchema),
});

export type InstansiSessionProgressStats = z.infer<
  typeof InstansiSessionProgressStatsSchema
>;
