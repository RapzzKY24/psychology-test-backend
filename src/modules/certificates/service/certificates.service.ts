import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ensureUploadDir } from '../../../lib/fs/ensure-upload-dir';
import { validateImageFile } from '../../../lib/upload/validate-image-file';
import { ageFromIsoDate } from '../utils/age-from-iso-date';
import { buildCertificateNumber } from '../utils/build-certificate-number';
import { buildCertificateSnapshot } from '../utils/certificate-snapshot';
import { jakartaDateParts } from '../../reports/utils/jakarta-date';
import { generateVerifyCode } from '../../reviews/utils/generate-verify-code';
import { isProfileComplete } from '../../psychologist/utils/is-profile-complete';
import {
  REPORT_SETTING_KEYS,
  DEFAULT_INSTITUTION_CODE,
} from '../../reports/report-settings';
import {
  CERTIFICATE_SETTING_KEYS,
  DEFAULT_CERTIFICATE_CITY,
} from '../certificate-settings';
import { EventLogService } from '../../event-log/service/event-log.service';
import type { CreateCertificateDto } from '../dto/create-certificate.dto';
import type { UpdateCertificateDto } from '../dto/update-certificate.dto';
import { CERTIFICATES_REPOSITORY } from '../repository/certificates.repository';
import type {
  CertificateIdentity,
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

@Injectable()
export class CertificatesService {
  constructor(
    @Inject(CERTIFICATES_REPOSITORY)
    private readonly repo: CertificatesRepository,
    private readonly config: ConfigService,
    private readonly eventLog: EventLogService,
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

    return this.repo.createDraft(dto.resultId, userId, new Date());
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

    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException('certificate_not_found');
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

  private async loadSettings(): Promise<{
    institutionCode: string;
    city: string;
  }> {
    const rows = await this.repo.findSettings([
      REPORT_SETTING_KEYS.institutionCode,
      CERTIFICATE_SETTING_KEYS.city,
    ]);
    const pick = (key: string, fallback: string): string => {
      const value = rows[key];
      return typeof value === 'string' && value.trim().length > 0
        ? value.trim()
        : fallback;
    };
    return {
      institutionCode: pick(
        REPORT_SETTING_KEYS.institutionCode,
        DEFAULT_INSTITUTION_CODE,
      ),
      city: pick(CERTIFICATE_SETTING_KEYS.city, DEFAULT_CERTIFICATE_CITY),
    };
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
