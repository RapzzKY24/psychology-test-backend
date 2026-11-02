import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  ReportDraftPatch,
  ReportIssuePatch,
  ReportParticipantContext,
  ReportRecord,
  ReportsRepository,
} from './reports.repository';
import type {
  Prisma,
  PsychologistProfile,
} from '../../../generated/prisma/client';

const DRAFT_SELECT = {
  id: true,
  participantId: true,
  status: true,
  ratings: true,
  narratives: true,
  recommendation: true,
  updatedAt: true,
} as const;

interface DraftRow {
  id: string;
  participantId: string;
  status: ReportRecord['status'];
  ratings: unknown;
  narratives: unknown;
  recommendation: ReportRecord['recommendation'];
  updatedAt: Date;
}

function toRecord(row: DraftRow): ReportRecord {
  return {
    id: row.id,
    participantId: row.participantId,
    status: row.status,
    ratings: (row.ratings ?? {}) as Record<string, string>,
    narratives: (row.narratives ?? {}) as Record<string, string>,
    recommendation: row.recommendation,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaReportsRepository implements ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findParticipantContext(
    participantId: string,
  ): Promise<ReportParticipantContext | null> {
    const row = await this.prisma.sessionParticipant.findUnique({
      where: { id: participantId },
      select: {
        id: true,
        name: true,
        session: {
          select: { id: true, title: true, institutionId: true },
        },
        institutionParticipant: {
          select: {
            birthDate: true,
            education: true,
            destinationCountry: true,
          },
        },
        attempts: {
          orderBy: { startedAt: 'asc' },
          select: {
            completedAt: true,
            test: { select: { name: true } },
            result: {
              select: {
                status: true,
                patternCode: true,
                correctedPatternCode: true,
              },
            },
          },
        },
      },
    });
    if (!row) return null;

    return {
      participantId: row.id,
      participantName: row.name,
      sessionId: row.session.id,
      sessionTitle: row.session.title,
      institutionId: row.session.institutionId,
      birthDate: row.institutionParticipant?.birthDate ?? null,
      education: row.institutionParticipant?.education ?? null,
      destinationCountry:
        row.institutionParticipant?.destinationCountry ?? null,
      tests: row.attempts.map((attempt) => ({
        testName: attempt.test.name,
        patternCode:
          attempt.result?.correctedPatternCode ??
          attempt.result?.patternCode ??
          null,
        status: attempt.result?.status ?? 'NOT_SUBMITTED',
        completedAt: attempt.completedAt,
      })),
    };
  }

  async findDraftByParticipant(
    participantId: string,
  ): Promise<ReportRecord | null> {
    const row = await this.prisma.report.findFirst({
      where: { participantId, status: 'DRAFT' },
      select: DRAFT_SELECT,
    });
    return row ? toRecord(row) : null;
  }

  async findActiveByParticipant(
    participantId: string,
  ): Promise<ReportRecord | null> {
    const row = await this.prisma.report.findFirst({
      where: { participantId, status: 'ACTIVE' },
      select: DRAFT_SELECT,
    });
    return row ? toRecord(row) : null;
  }

  async createDraft(
    participantId: string,
    patch: ReportDraftPatch,
  ): Promise<ReportRecord> {
    const row = await this.prisma.report.create({
      data: { participantId, ...patch },
      select: DRAFT_SELECT,
    });
    return toRecord(row);
  }

  async updateDraft(
    id: string,
    patch: ReportDraftPatch,
  ): Promise<ReportRecord> {
    const row = await this.prisma.report.update({
      where: { id },
      data: patch,
      select: DRAFT_SELECT,
    });
    return toRecord(row);
  }

  findPsychologist(userId: string): Promise<PsychologistProfile | null> {
    return this.prisma.psychologistProfile.findUnique({ where: { userId } });
  }

  async nextSeq(year: number): Promise<number> {
    const aggregate = await this.prisma.report.aggregate({
      where: { year },
      _max: { seq: true },
    });
    return (aggregate._max.seq ?? 49) + 1;
  }

  async nextRevision(participantId: string): Promise<number> {
    const aggregate = await this.prisma.report.aggregate({
      where: { participantId },
      _max: { revision: true },
    });
    return (aggregate._max.revision ?? 0) + 1;
  }

  async issueDraft(id: string, patch: ReportIssuePatch): Promise<ReportRecord> {
    const row = await this.prisma.report.update({
      where: { id },
      data: {
        ...patch,
        status: 'ACTIVE',
        snapshot: patch.snapshot as unknown as Prisma.InputJsonValue,
      },
      select: DRAFT_SELECT,
    });
    return toRecord(row);
  }

  async findSettings(
    keys: readonly string[],
  ): Promise<Record<string, unknown>> {
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: [...keys] } },
    });
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }
}
