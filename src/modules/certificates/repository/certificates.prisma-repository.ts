import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  CertificateDocument,
  CertificateDraftPatch,
  CertificateIdentity,
  CertificateIssuePatch,
  CertificateListItem,
  CertificateRecord,
  CertificateResultContext,
  CertificateRevokePatch,
  CertificateVerification,
  CertificatesRepository,
  IssuedCertificateForUser,
  PendingResult,
} from './certificates.repository';
import { EMPTY_IDENTITY } from './certificates.repository';
import type {
  Prisma,
  PsychologistProfile,
} from '../../../generated/prisma/client';

/** The sequence the certificate series starts from (spec D6). */
const FIRST_SEQ = 60;

const RECORD_SELECT = {
  id: true,
  resultId: true,
  status: true,
  identity: true,
  verdict: true,
  purpose: true,
  validUntil: true,
  photoPath: true,
  filledById: true,
  number: true,
  seq: true,
  year: true,
  revision: true,
  supersedesId: true,
  verifyCode: true,
  issuedAt: true,
  revokedAt: true,
  revokeReason: true,
  updatedAt: true,
} as const;

interface RecordRow {
  id: string;
  resultId: string;
  status: CertificateRecord['status'];
  identity: unknown;
  verdict: CertificateRecord['verdict'];
  purpose: string | null;
  validUntil: Date | null;
  photoPath: string | null;
  filledById: string | null;
  number: string | null;
  seq: number | null;
  year: number | null;
  revision: number | null;
  supersedesId: string | null;
  verifyCode: string | null;
  issuedAt: Date | null;
  revokedAt: Date | null;
  revokeReason: string | null;
  updatedAt: Date;
}

/**
 * A draft starts with `{}`, so the column can hold a partial block while the
 * psychologist is still typing. Reading it back through this keeps callers from
 * having to guard every field.
 */
function toIdentity(value: unknown): CertificateIdentity {
  if (!value || typeof value !== 'object') return { ...EMPTY_IDENTITY };
  return { ...EMPTY_IDENTITY, ...(value as Partial<CertificateIdentity>) };
}

function toRecord(row: RecordRow): CertificateRecord {
  return { ...row, identity: toIdentity(row.identity) };
}

@Injectable()
export class PrismaCertificatesRepository implements CertificatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<CertificateRecord | null> {
    const row = await this.prisma.certificate.findUnique({
      where: { id },
      select: RECORD_SELECT,
    });
    return row ? toRecord(row) : null;
  }

  async findByResult(resultId: string): Promise<CertificateRecord[]> {
    const rows = await this.prisma.certificate.findMany({
      where: { resultId },
      select: RECORD_SELECT,
      orderBy: { revision: 'desc' },
    });
    return rows.map(toRecord);
  }

  async findDraftForResult(
    resultId: string,
  ): Promise<CertificateRecord | null> {
    const row = await this.prisma.certificate.findFirst({
      where: { resultId, status: 'DRAFT' },
      select: RECORD_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return row ? toRecord(row) : null;
  }

  async createDraft(
    resultId: string,
    ownerId: string,
    at: Date,
  ): Promise<CertificateRecord> {
    const row = await this.prisma.certificate.create({
      data: { resultId, filledById: ownerId, filledAt: at },
      select: RECORD_SELECT,
    });
    return toRecord(row);
  }

  async createRevisionDraft(
    source: CertificateRecord,
    ownerId: string,
    at: Date,
  ): Promise<CertificateRecord> {
    const row = await this.prisma.certificate.create({
      data: {
        resultId: source.resultId,
        filledById: ownerId,
        filledAt: at,
        identity: source.identity as unknown as Prisma.InputJsonValue,
        verdict: source.verdict,
        purpose: source.purpose,
        validUntil: source.validUntil,
        photoPath: source.photoPath,
        // The number belongs to the series, not to the revision: a correction
        // keeps it so the reprint is recognisably the same document.
        number: source.number,
        seq: source.seq,
        year: source.year,
        supersedesId: source.id,
      },
      select: RECORD_SELECT,
    });
    return toRecord(row);
  }

  async findResultContext(
    resultId: string,
  ): Promise<CertificateResultContext | null> {
    const row = await this.prisma.testResult.findUnique({
      where: { id: resultId },
      select: {
        id: true,
        status: true,
        attempt: {
          select: {
            test: { select: { name: true, slug: true } },
            participant: { select: { name: true } },
            session: { select: { title: true } },
          },
        },
      },
    });
    if (!row) return null;
    return {
      resultId: row.id,
      status: row.status,
      testName: row.attempt.test.name,
      testSlug: row.attempt.test.slug,
      participantName: row.attempt.participant?.name ?? null,
      sessionTitle: row.attempt.session?.title ?? null,
    };
  }

  async updateDraft(
    id: string,
    patch: CertificateDraftPatch,
  ): Promise<CertificateRecord> {
    const row = await this.prisma.certificate.update({
      where: { id },
      data: {
        identity: patch.identity as unknown as Prisma.InputJsonValue,
        verdict: patch.verdict,
        purpose: patch.purpose,
        validUntil: patch.validUntil,
        photoPath: patch.photoPath,
        filledAt: patch.filledAt,
      },
      select: RECORD_SELECT,
    });
    return toRecord(row);
  }

  async setPhoto(
    id: string,
    photoPath: string | null,
  ): Promise<CertificateRecord> {
    const row = await this.prisma.certificate.update({
      where: { id },
      data: { photoPath },
      select: RECORD_SELECT,
    });
    return toRecord(row);
  }

  async issue(
    id: string,
    patch: CertificateIssuePatch,
  ): Promise<CertificateRecord> {
    return this.prisma.$transaction(async (tx) => {
      // Re-read inside the transaction: two submits that arrive together would
      // otherwise both see DRAFT and both assign a number.
      const current = await tx.certificate.findUnique({
        where: { id },
        select: { status: true, supersedesId: true },
      });
      if (!current) throw new Error('certificate_not_found');
      if (current.status !== 'DRAFT') throw new Error('certificate_not_draft');

      if (current.supersedesId) {
        // Same transaction: a revision must never leave two live revisions,
        // and the old QR has to stop resolving the moment the new one exists.
        await tx.certificate.update({
          where: { id: current.supersedesId },
          data: { status: 'SUPERSEDED', verifyCode: null },
        });
      }

      const row = await tx.certificate.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          number: patch.number,
          seq: patch.seq,
          year: patch.year,
          revision: patch.revision,
          verifyCode: patch.verifyCode,
          snapshot: patch.snapshot as Prisma.InputJsonValue,
          issuedAt: patch.issuedAt,
          issuedById: patch.issuedById,
        },
        select: RECORD_SELECT,
      });
      return toRecord(row);
    });
  }

  /**
   * The verify code stays on the row on purpose (D10): a paper already in
   * circulation must answer "this certificate was cancelled, here is why"
   * rather than "no such document". Only a superseded revision goes quiet,
   * and that code is cleared by `issue` when the replacement lands.
   */
  async revoke(
    id: string,
    patch: CertificateRevokePatch,
  ): Promise<CertificateRecord> {
    const row = await this.prisma.certificate.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedAt: patch.revokedAt,
        revokedById: patch.revokedById,
        revokeReason: patch.reason,
      },
      select: RECORD_SELECT,
    });
    return toRecord(row);
  }

  async findForPdf(id: string): Promise<CertificateDocument | null> {
    const row = await this.prisma.certificate.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        revision: true,
        status: true,
        snapshot: true,
        verifyCode: true,
      },
    });
    if (!row || !row.number || row.revision === null) return null;
    return {
      id: row.id,
      number: row.number,
      revision: row.revision,
      status: row.status,
      snapshot: row.snapshot,
      verifyCode: row.verifyCode,
    };
  }

  async findForPdfInInstitution(
    id: string,
    institutionId: string,
  ): Promise<CertificateDocument | null> {
    const row = await this.prisma.certificate.findFirst({
      where: { id, result: { attempt: { session: { institutionId } } } },
      select: {
        id: true,
        number: true,
        revision: true,
        status: true,
        snapshot: true,
        verifyCode: true,
      },
    });
    if (!row || !row.number || row.revision === null) return null;
    return {
      id: row.id,
      number: row.number,
      revision: row.revision,
      status: row.status,
      snapshot: row.snapshot,
      verifyCode: row.verifyCode,
    };
  }

  async listCertificates(params: {
    skip: number;
    take: number;
    ownerId?: string;
    status?: CertificateRecord['status'];
  }): Promise<{ data: CertificateListItem[]; total: number }> {
    const where: Prisma.CertificateWhereInput = {
      ...(params.ownerId ? { filledById: params.ownerId } : {}),
      ...(params.status ? { status: params.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.certificate.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          number: true,
          revision: true,
          status: true,
          identity: true,
          issuedAt: true,
          updatedAt: true,
          result: {
            select: {
              attempt: { select: { test: { select: { name: true } } } },
            },
          },
        },
      }),
      this.prisma.certificate.count({ where }),
    ]);

    return {
      total,
      data: rows.map((row) => ({
        id: row.id,
        number: row.number,
        revision: row.revision,
        status: row.status,
        testName: row.result.attempt.test.name,
        holderName: toIdentity(row.identity).fullName,
        issuedAt: row.issuedAt,
        updatedAt: row.updatedAt,
      })),
    };
  }

  async findForPdfForUser(
    id: string,
    userId: string,
  ): Promise<CertificateDocument | null> {
    const row = await this.prisma.certificate.findFirst({
      where: { id, result: { attempt: { userId } } },
      select: {
        id: true,
        number: true,
        revision: true,
        status: true,
        snapshot: true,
        verifyCode: true,
      },
    });
    if (!row || !row.number || row.revision === null) return null;
    return {
      id: row.id,
      number: row.number,
      revision: row.revision,
      status: row.status,
      snapshot: row.snapshot,
      verifyCode: row.verifyCode,
    };
  }

  async listIssuedByUser(params: {
    userId: string;
    skip: number;
    take: number;
  }): Promise<{ data: IssuedCertificateForUser[]; total: number }> {
    const where: Prisma.CertificateWhereInput = {
      // A DRAFT has no number to show and a SUPERSEDED row is already
      // represented by the revision that replaced it.
      status: { in: ['ACTIVE', 'REVOKED'] },
      number: { not: null },
      issuedAt: { not: null },
      result: { attempt: { userId: params.userId } },
    };

    const [rows, total] = await Promise.all([
      this.prisma.certificate.findMany({
        where,
        skip: params.skip,
        take: params.take,
        // `id` breaks ties: two rows issued in the same millisecond must not
        // swap places between pages.
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          number: true,
          status: true,
          issuedAt: true,
          validUntil: true,
          verifyCode: true,
          result: {
            select: {
              attempt: { select: { test: { select: { name: true } } } },
            },
          },
        },
      }),
      this.prisma.certificate.count({ where }),
    ]);

    return {
      total,
      data: rows.map((row) => ({
        id: row.id,
        // The where clause excludes nulls; the cast keeps the DTO honest.
        number: row.number as string,
        status: row.status as 'ACTIVE' | 'REVOKED',
        testName: row.result.attempt.test.name,
        issuedAt: row.issuedAt as Date,
        validUntil: row.validUntil,
        verifyCode: row.verifyCode,
      })),
    };
  }

  async findPendingResults(params: {
    skip: number;
    take: number;
  }): Promise<{ data: PendingResult[]; total: number }> {
    const where: Prisma.TestResultWhereInput = {
      status: 'APPROVED',
      // WPT keeps its own document, so it must never appear in this queue.
      attempt: { test: { slug: { not: 'wpt' } } },
      certificates: { none: { status: { in: ['DRAFT', 'ACTIVE'] } } },
    };

    const [rows, total] = await Promise.all([
      this.prisma.testResult.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { reviewedAt: 'asc' },
        select: {
          id: true,
          reviewedAt: true,
          attempt: {
            select: {
              test: { select: { name: true, slug: true } },
              participant: { select: { name: true } },
              session: { select: { title: true } },
            },
          },
        },
      }),
      this.prisma.testResult.count({ where }),
    ]);

    return {
      total,
      data: rows.map((row) => ({
        resultId: row.id,
        testName: row.attempt.test.name,
        testSlug: row.attempt.test.slug,
        participantName: row.attempt.participant?.name ?? null,
        approvedAt: row.reviewedAt,
        sessionTitle: row.attempt.session?.title ?? null,
      })),
    };
  }

  async findByVerifyCode(
    code: string,
  ): Promise<CertificateVerification | null> {
    const row = await this.prisma.certificate.findFirst({
      where: { verifyCode: code, status: { in: ['ACTIVE', 'REVOKED'] } },
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
    if (!row || !row.number || row.revision === null) return null;
    return {
      number: row.number,
      revision: row.revision,
      status: row.status,
      snapshot: row.snapshot,
      issuedAt: row.issuedAt,
      revokedAt: row.revokedAt,
      revokeReason: row.revokeReason,
    };
  }

  async nextRevision(resultId: string): Promise<number> {
    const aggregate = await this.prisma.certificate.aggregate({
      where: { resultId },
      _max: { revision: true },
    });
    return (aggregate._max.revision ?? 0) + 1;
  }

  findPsychologist(userId: string): Promise<PsychologistProfile | null> {
    return this.prisma.psychologistProfile.findUnique({ where: { userId } });
  }

  async findSettings(
    keys: readonly string[],
  ): Promise<Record<string, unknown>> {
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: [...keys] } },
    });
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  async nextSeq(year: number): Promise<number> {
    const aggregate = await this.prisma.certificate.aggregate({
      where: { year },
      _max: { seq: true },
    });
    // A new year has no rows, so the max is null and the series restarts at 60.
    return (aggregate._max.seq ?? FIRST_SEQ - 1) + 1;
  }
}
