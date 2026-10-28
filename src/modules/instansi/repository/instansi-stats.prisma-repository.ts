import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  InstansiStatsRepository,
  SessionProgressRow,
} from './instansi-stats.repository';

const SESSION_SELECT = {
  id: true,
  title: true,
  status: true,
  slotLimit: true,
  participants: {
    select: {
      attempts: { select: { status: true } },
    },
  },
} satisfies Prisma.TestSessionSelect;

type SessionWithProgress = Prisma.TestSessionGetPayload<{
  select: typeof SESSION_SELECT;
}>;

@Injectable()
export class PrismaInstansiStatsRepository implements InstansiStatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findSessionProgress(params: {
    institutionId: string;
    limit: number;
  }): Promise<SessionProgressRow[]> {
    // Two bounded queries instead of one: a plain enum sort would put
    // PENDING_PAYMENT ahead of ACTIVE, and fetching everything just to re-sort
    // in memory would grow with the institution.
    const [active, others] = await Promise.all([
      this.prisma.testSession.findMany({
        where: { institutionId: params.institutionId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: params.limit,
        select: SESSION_SELECT,
      }),
      this.prisma.testSession.findMany({
        where: {
          institutionId: params.institutionId,
          status: { not: 'ACTIVE' },
        },
        orderBy: { createdAt: 'desc' },
        take: params.limit,
        select: SESSION_SELECT,
      }),
    ]);

    return [...active, ...others]
      .slice(0, params.limit)
      .map((session) => toProgressRow(session));
  }
}

function toProgressRow(session: SessionWithProgress): SessionProgressRow {
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    slotLimit: session.slotLimit,
    participants: session.participants.map((participant) => ({
      attemptStatuses: participant.attempts.map((attempt) => attempt.status),
    })),
  };
}
