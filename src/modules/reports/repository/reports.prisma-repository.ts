import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  ReportDocument,
  ReportDraftPatch,
  ReportRevisionPatch,
  ReportIssuePatch,
  ReportListItem,
  ReportParticipantContext,
  ReportRecord,
  ReportVerification,
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

const DOCUMENT_SELECT = {
  id: true,
  participantId: true,
  number: true,
  revision: true,
  verifyCode: true,
  status: true,
  snapshot: true,
} as const;

interface DocumentRow {
  id: string;
  participantId: string;
  number: string | null;
  revision: number | null;
  verifyCode: string | null;
  status: ReportDocument['status'];
  snapshot: unknown;
}

function toDocument(row: DocumentRow | null): ReportDocument | null {
  if (!row?.number || !row.verifyCode || !row.snapshot || !row.revision) {
    return null;
  }
  return {
    id: row.id,
    participantId: row.participantId,
    number: row.number,
    revision: row.revision,
    verifyCode: row.verifyCode,
    status: row.status,
    snapshot: row.snapshot as ReportDocument['snapshot'],
  };
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

  private async listRows(
    where: Prisma.ReportWhereInput,
    skip: number,
    take: number,
  ): Promise<{ data: ReportListItem[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip,
        take,
        // Enum order is DRAFT, ACTIVE, SUPERSEDED, REVOKED — drafts float up,
        // which is exactly the psychologist's work queue.
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          participantId: true,
          number: true,
          revision: true,
          status: true,
          issuedAt: true,
          participant: {
            select: {
              name: true,
              session: { select: { id: true, title: true } },
              attempts: { select: { result: { select: { status: true } } } },
            },
          },
        },
      }),
      this.prisma.report.count({ where }),
    ]);

    const data: ReportListItem[] = rows.map((row) => ({
      id: row.id,
      participantId: row.participantId,
      participantName: row.participant.name,
      sessionId: row.participant.session.id,
      sessionTitle: row.participant.session.title,
      number: row.number,
      revision: row.revision,
      status: row.status,
      issuedAt: row.issuedAt,
      testsTotal: row.participant.attempts.length,
      testsApproved: row.participant.attempts.filter(
        (attempt) => attempt.result?.status === 'APPROVED',
      ).length,
    }));

    return { data, total };
  }

  async listReports(params: {
    skip: number;
    take: number;
    status?: ReportRecord['status'];
    sessionId?: string;
  }): Promise<{ data: ReportListItem[]; total: number }> {
    const where: Prisma.ReportWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.sessionId) where.participant = { sessionId: params.sessionId };
    return this.listRows(where, params.skip, params.take);
  }

  async listForInstitution(params: {
    institutionId: string;
    sessionId?: string;
    skip: number;
    take: number;
  }): Promise<{ data: ReportListItem[]; total: number }> {
    // Institutions only ever see documents that exist: an issued report or one
    // that was cancelled. Drafts are the psychologist's working notes.
    const where: Prisma.ReportWhereInput = {
      status: { in: ['ACTIVE', 'REVOKED'] },
      participant: {
        session: {
          institutionId: params.institutionId,
          ...(params.sessionId ? { id: params.sessionId } : {}),
        },
      },
    };
    return this.listRows(where, params.skip, params.take);
  }

  async findForPdf(id: string): Promise<ReportDocument | null> {
    const row = await this.prisma.report.findUnique({
      where: { id },
      select: DOCUMENT_SELECT,
    });
    return toDocument(row);
  }

  async findForPdfInInstitution(
    id: string,
    institutionId: string,
  ): Promise<ReportDocument | null> {
    const row = await this.prisma.report.findFirst({
      where: {
        id,
        participant: { session: { institutionId } },
      },
      select: DOCUMENT_SELECT,
    });
    return toDocument(row);
  }

  async findByVerifyCode(code: string): Promise<ReportVerification | null> {
    const row = await this.prisma.report.findUnique({
      where: { verifyCode: code },
      select: {
        number: true,
        revision: true,
        status: true,
        snapshot: true,
        issuedAt: true,
        revokedAt: true,
        revokeReason: true,
      },
    });
    if (!row?.number || row.revision === null || !row.snapshot) return null;

    return {
      number: row.number,
      revision: row.revision,
      status: row.status,
      snapshot: row.snapshot as unknown as ReportVerification['snapshot'],
      issuedAt: row.issuedAt,
      revokedAt: row.revokedAt,
      revokeReason: row.revokeReason,
    };
  }

  /**
   * One transaction: release the ACTIVE slot (and the verify code) on the old
   * row, then insert the next revision with the same number. The old row keeps
   * its number so the history stays readable.
   */
  async supersede(
    id: string,
    patch: ReportRevisionPatch,
  ): Promise<ReportRecord> {
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.report.findUnique({ where: { id } });
      if (!previous) throw new Error('report_not_found');

      await tx.report.update({
        where: { id },
        data: { status: 'SUPERSEDED', verifyCode: null },
      });

      const created = await tx.report.create({
        data: {
          participantId: previous.participantId,
          status: 'ACTIVE',
          ratings: patch.ratings,
          narratives: patch.narratives,
          recommendation: patch.recommendation,
          filledById: previous.filledById,
          filledAt: previous.filledAt,
          number: previous.number,
          seq: previous.seq,
          year: previous.year,
          revision: patch.revision,
          verifyCode: patch.verifyCode,
          snapshot: patch.snapshot as unknown as Prisma.InputJsonValue,
          issuedAt: patch.issuedAt,
          issuedById: patch.issuedById,
          supersedesId: id,
        },
        select: DRAFT_SELECT,
      });

      return toRecord(created);
    });
  }

  async revoke(
    id: string,
    patch: { reason: string; revokedAt: Date; revokedById: string },
  ): Promise<ReportRecord> {
    const row = await this.prisma.report.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedAt: patch.revokedAt,
        revokedById: patch.revokedById,
        revokeReason: patch.reason,
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
