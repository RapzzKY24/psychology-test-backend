import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';
import { ensureUploadDir } from '../../../lib/fs/ensure-upload-dir';
import { validateImageFile } from '../../../lib/upload/validate-image-file';
import { ageFromIsoDate } from '../utils/age-from-iso-date';
import { buildCertificateNumber } from '../utils/build-certificate-number';
import {
  buildCertificateSnapshot,
  buildPreviewSnapshot,
} from '../utils/certificate-snapshot';
import { DRAFT_CERTIFICATE_FILENAME } from '../utils/certificate-filename';
import { verificationUrl } from '../../../lib/url/verification-url';
import { CertificateDocumentService } from './certificate-document.service';
import type { RenderedCertificate } from './certificate-document.service';
import { jakartaDateParts } from '../../reports/utils/jakarta-date';
import { generateVerifyCode } from '../../reviews/utils/generate-verify-code';
import { isProfileComplete } from '../../psychologist/utils/is-profile-complete';
import { readCertificateSettings } from '../certificate-settings';
import type { CertificateSettings } from '../certificate-settings';
import { EventLogService } from '../../event-log/service/event-log.service';
import type { CreateCertificateDto } from '../dto/create-certificate.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import type { QueryCertificatesDto } from '../dto/query-certificates.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';
import type { PendingResult } from '../repository/certificates.repository';
import type { UpdateCertificateDto } from '../dto/update-certificate.dto';
import { CERTIFICATES_REPOSITORY } from '../repository/certificates.repository';
import type {
  CertificateIdentity,
  CertificateListItem,
  CertificateRecord,
  CertificatesRepository,
} from '../repository/certificates.repository';

/** WPT keeps its own document, so it never gets a general certificate (D7). */
const EXCLUDED_TEST_SLUG = 'wpt';

/** Who is acting. The role guard already ran; this only decides ownership. */
export interface CertificateActor {
  id: string;
  isAdmin: boolean;
}

/**
 * A calendar day typed by the psychologist, stored as midnight Jakarta so the
 * printed date is the one that was entered regardless of server timezone.
 */
function jakartaMidnight(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00+07:00`);
}

/** Audit trail entry written when an issued certificate is withdrawn. */
const CERTIFICATE_REVOKED_EVENT = 'certificate.revoked';

/** How many times a number collision is retried before giving up. */
const ISSUE_ATTEMPTS = 5;

export interface IssuedCertificate {
  id: string;
  number: string;
  revision: number;
  status: 'ACTIVE';
  issuedAt: Date;
  verifyCode: string;
}

/** What the draft editor loads: the row, the result it belongs to, and how far
 * it still is from being printable. */
export interface CertificateFormView {
  certificate: CertificateRecord;
  result: {
    resultId: string;
    testName: string;
    testSlug: string;
    participantName: string | null;
    sessionTitle: string | null;
  };
  readiness: {
    profileComplete: boolean;
    missingFields: string[];
  };
}

@Injectable()
export class CertificatesService {
  constructor(
    @Inject(CERTIFICATES_REPOSITORY)
    private readonly repo: CertificatesRepository,
    private readonly config: ConfigService,
    private readonly eventLog: EventLogService,
    private readonly documents: CertificateDocumentService,
  ) {}

  /**
   * Opens the draft for a result. Calling it twice returns the existing draft
   * rather than failing: a double click on "Terbitkan sertifikat" must not
   * produce a second row, and the unique index would reject it anyway.
   */
  async createDraft(
    userId: string,
    dto: CreateCertificateDto,
  ): Promise<CertificateRecord> {
    const context = await this.repo.findResultContext(dto.resultId);
    if (!context) throw new NotFoundException('result_not_found');
    if (context.testSlug === EXCLUDED_TEST_SLUG) {
      throw new ConflictException('wpt_not_supported');
    }
    if (context.status !== 'APPROVED') {
      throw new ConflictException('result_not_approved');
    }

    const existing = await this.repo.findDraftForResult(dto.resultId);
    if (existing) return existing;

    return this.repo.createDraft(
      dto.resultId,
      userId,
      new Date(),
      context.holderName,
    );
  }

  /** The psychologist's own certificates; an admin sees every row. */
  async list(
    actor: CertificateActor,
    query: QueryCertificatesDto,
  ): Promise<PaginatedResponse<CertificateListItem>> {
    const { data, total } = await this.repo.listCertificates({
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      ownerId: actor.isAdmin ? undefined : actor.id,
      status: query.status,
    });
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /** Approved, non-WPT results that have no draft or live certificate yet. */
  async listPending(
    query: PaginationDto,
  ): Promise<PaginatedResponse<PendingResult>> {
    const { data, total } = await this.repo.findPendingResults({
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /** One certificate with what the editor needs around it. */
  async findOne(
    actor: CertificateActor,
    id: string,
  ): Promise<CertificateFormView> {
    const certificate = await this.loadOwned(actor, id);
    const [result, profile] = await Promise.all([
      this.repo.findResultContext(certificate.resultId),
      this.repo.findPsychologist(actor.id),
    ]);
    if (!result) throw new NotFoundException('result_not_found');

    return {
      certificate,
      result: {
        resultId: result.resultId,
        testName: result.testName,
        testSlug: result.testSlug,
        participantName: result.holderName ?? result.participantName,
        sessionTitle: result.sessionTitle,
      },
      readiness: {
        profileComplete: Boolean(profile && isProfileComplete(profile)),
        // The photo is checked separately at issue time, but the editor has to
        // count it — otherwise the form says "ready" and publish refuses.
        missingFields: [
          ...this.collectMissing(certificate),
          ...(certificate.photoPath ? [] : ['photo']),
        ],
      },
    };
  }

  async update(
    actor: CertificateActor,
    id: string,
    dto: UpdateCertificateDto,
  ): Promise<CertificateRecord> {
    const draft = await this.findEditable(actor, id);

    return this.repo.updateDraft(id, {
      identity: this.mergeIdentity(draft.identity, dto.identity),
      verdict: dto.verdict === undefined ? draft.verdict : dto.verdict,
      purpose: dto.purpose === undefined ? draft.purpose : dto.purpose,
      validUntil:
        dto.validUntil === undefined
          ? draft.validUntil
          : dto.validUntil === null
            ? null
            : jakartaMidnight(dto.validUntil),
      photoPath: draft.photoPath,
      filledAt: new Date(),
    });
  }

  async uploadPhoto(
    actor: CertificateActor,
    id: string,
    file: Express.Multer.File,
  ): Promise<CertificateRecord> {
    const draft = await this.findEditable(actor, id);
    validateImageFile(file);

    const dir = await this.photoDir();
    // Extension comes from the allow-listed mimetype only — originalname is
    // client-controlled and must not decide the stored file type.
    const filename = `${randomUUID()}${file.mimetype === 'image/png' ? '.png' : '.jpg'}`;
    const stored = path.join(dir, filename);
    await fs.writeFile(stored, file.buffer);

    const updated = await this.repo.setPhoto(id, stored);
    // Best effort: a leftover file costs disk, a failed delete must not fail
    // the upload the psychologist just completed.
    await this.removePhoto(draft.photoPath, dir);
    return updated;
  }

  /**
   * Reads the stored photo for the streaming endpoint.
   *
   * The photo is a participant's personal data, so it is never mounted as
   * public static: it is served by an authenticated route that first proves
   * the caller owns the certificate, then jails the database value to the
   * upload directory (same guard as the signature download).
   *
   * The bytes come back instead of a path so the controller can answer with a
   * `StreamableFile`: that keeps the envelope interceptor and the exception
   * filter in the way, both of which `res.sendFile` bypasses.
   */
  async readPhoto(
    actor: CertificateActor,
    id: string,
  ): Promise<{ buffer: Buffer; type: string }> {
    const row = await this.loadOwned(actor, id);
    if (!row.photoPath) throw new NotFoundException('photo_not_found');

    const uploadDir = this.config.get<string>('app.uploadDir', './uploads');
    const base = `${path.resolve(uploadDir)}${path.sep}`;
    const full = path.resolve(row.photoPath);
    if (!full.startsWith(base)) {
      throw new NotFoundException('photo_not_found');
    }

    try {
      return {
        buffer: await fs.readFile(full),
        // uploadPhoto stores only .png or .jpg, so the extension is enough.
        type:
          path.extname(full).toLowerCase() === '.png'
            ? 'image/png'
            : 'image/jpeg',
      };
    } catch {
      throw new NotFoundException('photo_not_found');
    }
  }

  /**
   * The validation QR on its own, for the on-screen card. Same encoder and the
   * same URL as the printed page, so scanning the screen and scanning the paper
   * lead to the same answer.
   */
  async getVerifyQr(actor: CertificateActor, id: string): Promise<Buffer> {
    const row = await this.loadOwned(actor, id);
    if (!row.verifyCode) {
      throw new NotFoundException('verify_code_not_assigned');
    }

    const target = verificationUrl(
      this.config.get<string>('app.publicUrl'),
      'verifikasi-sertifikat',
      row.verifyCode,
    );
    if (!target) {
      throw new InternalServerErrorException('certificate_public_url_missing');
    }
    return QRCode.toBuffer(target, { type: 'png', margin: 1, width: 320 });
  }

  /**
   * Renders the draft as it stands, watermarked and without a number. The
   * psychologist is about to sign this page, so it must be drawn from the same
   * rows the issue step will freeze — not from the browser's copy of the form.
   */
  async preview(
    actor: CertificateActor,
    id: string,
  ): Promise<RenderedCertificate> {
    const draft = await this.findEditable(actor, id);
    const [context, profile, settings] = await Promise.all([
      this.repo.findResultContext(draft.resultId),
      this.repo.findPsychologist(actor.id),
      this.loadSettings(),
    ]);
    if (!context) throw new NotFoundException('result_not_found');

    const view = buildPreviewSnapshot({
      record: draft,
      context,
      profile,
      city: settings.city,
      at: new Date(),
    });
    const buffer = await this.documents.renderDocument(view, {
      verifyCode: null,
      draft: true,
    });
    return { buffer, filename: DRAFT_CERTIFICATE_FILENAME };
  }

  private async findEditable(
    actor: CertificateActor,
    id: string,
  ): Promise<CertificateRecord> {
    const row = await this.loadOwned(actor, id);
    // An issued certificate is immutable; a correction is a new revision.
    if (row.status !== 'DRAFT') {
      throw new ConflictException('certificate_not_editable');
    }
    return row;
  }

  private async loadOwned(
    actor: CertificateActor,
    id: string,
  ): Promise<CertificateRecord> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException('certificate_not_found');
    if (!actor.isAdmin && row.filledById !== actor.id) {
      throw new ForbiddenException('certificate_not_owned');
    }
    return row;
  }

  /** Partial save: a field the request omits keeps the value already stored. */
  private mergeIdentity(
    current: CertificateIdentity,
    patch: Partial<CertificateIdentity> | undefined,
  ): CertificateIdentity {
    if (!patch) return current;

    const merged = { ...current, ...patch };
    // Usia follows the birth date unless the psychologist typed one by hand
    // (spec D3) — a certificate whose age contradicts its own birth date is
    // worse than one with no age at all.
    if (patch.birthDate && patch.age === undefined) {
      merged.age = ageFromIsoDate(patch.birthDate, new Date()) ?? merged.age;
    }
    return merged;
  }

  /**
   * Assigns the number, freezes the snapshot and flips the row to ACTIVE.
   *
   * Every reason to refuse is checked before anything is written, so a
   * rejected issue never leaves a half-filled row behind.
   */
  async issue(actor: CertificateActor, id: string): Promise<IssuedCertificate> {
    const draft = await this.loadOwned(actor, id);
    if (draft.status === 'ACTIVE')
      throw new ConflictException('already_issued');
    if (draft.status !== 'DRAFT') {
      throw new ConflictException('certificate_not_editable');
    }

    if (!draft.photoPath) throw new BadRequestException('photo_required');
    const missing = this.collectMissing(draft);
    if (missing.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'incomplete_draft',
        error: 'Bad Request',
        details: missing,
      });
    }

    const profile = await this.repo.findPsychologist(actor.id);
    if (!profile || !isProfileComplete(profile)) {
      throw new UnprocessableEntityException('profile_incomplete');
    }

    const context = await this.repo.findResultContext(draft.resultId);
    if (!context) throw new NotFoundException('result_not_found');

    const settings = await this.loadSettings();
    const issuedAt = new Date();
    const { year, month } = jakartaDateParts(issuedAt);
    const revision = await this.repo.nextRevision(draft.resultId);
    // A correction keeps the number it was issued under; only a first issue
    // takes a new one from the series.
    const isRevision = Boolean(draft.supersedesId);

    for (let attempt = 0; attempt < ISSUE_ATTEMPTS; attempt++) {
      try {
        const seq = isRevision ? draft.seq : await this.repo.nextSeq(year);
        const numberYear = isRevision ? draft.year : year;
        if (seq === null || numberYear === null) {
          throw new Error('certificate_revision_missing_number');
        }
        const number = isRevision
          ? draft.number
          : buildCertificateNumber({
              seq,
              testName: context.testName,
              institutionCode: settings.institutionCode,
              month,
              year,
            });
        if (!number) throw new Error('certificate_revision_missing_number');

        const verifyCode = generateVerifyCode();
        const snapshot = buildCertificateSnapshot({
          context,
          draft,
          profile,
          city: settings.city,
          number,
          issuedAt,
        });

        await this.repo.issue(draft.id, {
          number,
          seq,
          year: numberYear,
          revision,
          verifyCode,
          snapshot,
          issuedAt,
          issuedById: actor.id,
        });

        return {
          id: draft.id,
          number,
          revision,
          status: 'ACTIVE',
          issuedAt,
          verifyCode,
        };
      } catch (error) {
        if ((error as { code?: string })?.code !== 'P2002') throw error;
        // Two issues raced: the loser must report the winner, not retry.
        const current = await this.repo.findById(id);
        if (!current) throw new NotFoundException('certificate_not_found');
        if (current.status !== 'DRAFT') {
          throw new ConflictException('already_issued');
        }
        // Otherwise the sequence collided — take the next one and retry.
      }
    }

    throw new ConflictException('certificate_issue_conflict');
  }

  /**
   * Opens a draft that corrects an issued certificate. The source stays ACTIVE
   * until this one is issued, so the QR already in circulation keeps working
   * while the correction is being prepared.
   */
  async createRevision(
    actor: CertificateActor,
    id: string,
  ): Promise<CertificateRecord> {
    const source = await this.loadOwned(actor, id);
    if (source.status !== 'ACTIVE') {
      throw new ConflictException('certificate_not_active');
    }

    const open = await this.repo.findDraftForResult(source.resultId);
    if (open) return open;

    return this.repo.createRevisionDraft(source, actor.id, new Date());
  }

  async revoke(
    actor: CertificateActor,
    id: string,
    reason: string,
  ): Promise<CertificateRecord> {
    if (!reason || reason.trim().length < 10) {
      throw new UnprocessableEntityException('reason_too_short');
    }

    // The psychologist who signed it may withdraw it; anyone else needs ADMIN.
    const row = await this.loadOwned(actor, id);
    if (row.status !== 'ACTIVE') {
      throw new ConflictException('certificate_not_active');
    }

    const revoked = await this.repo.revoke(id, {
      reason: reason.trim(),
      revokedAt: new Date(),
      revokedById: actor.id,
    });

    const event = await this.eventLog.record({
      source: 'MANUAL',
      direction: 'INBOUND',
      type: CERTIFICATE_REVOKED_EVENT,
      aggregateType: 'Certificate',
      aggregateId: id,
      payload: { actorId: actor.id, reason: reason.trim(), number: row.number },
    });
    await this.eventLog.markProcessed(event.id, {
      response: { certificateId: id, status: 'REVOKED' },
    });

    return revoked;
  }

  /** Fields the printed document cannot be produced without. */
  private collectMissing(draft: CertificateRecord): string[] {
    const missing: string[] = [];
    if (!draft.verdict) missing.push('verdict');
    if (!draft.purpose) missing.push('purpose');
    if (!draft.validUntil) missing.push('validUntil');
    for (const [key, value] of Object.entries(draft.identity)) {
      if (value === '' || value === null) missing.push(`identity.${key}`);
    }
    return missing;
  }

  private loadSettings(): Promise<CertificateSettings> {
    return readCertificateSettings(this.repo);
  }

  private async photoDir(): Promise<string> {
    const root = this.config.get<string>('app.uploadDir', './uploads');
    const dir = path.join(root, 'certificates');
    await ensureUploadDir(dir);
    return dir;
  }

  private async removePhoto(stored: string | null, dir: string): Promise<void> {
    if (!stored) return;
    // Only ever unlink from the certificates directory: the stored string
    // comes from the database, and a bad value must not delete something else.
    if (path.resolve(path.dirname(stored)) !== path.resolve(dir)) return;
    await fs.unlink(stored).catch(() => undefined);
  }
}
