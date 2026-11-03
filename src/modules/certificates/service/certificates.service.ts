import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ensureUploadDir } from '../../../lib/fs/ensure-upload-dir';
import { validateImageFile } from '../../../lib/upload/validate-image-file';
import { ageFromIsoDate } from '../utils/age-from-iso-date';
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

@Injectable()
export class CertificatesService {
  constructor(
    @Inject(CERTIFICATES_REPOSITORY)
    private readonly repo: CertificatesRepository,
    private readonly config: ConfigService,
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
    const draft = await this.repo.findById(id);
    if (!draft) throw new NotFoundException('certificate_not_found');

    // An issued certificate is immutable; a correction is a new revision.
    if (draft.status !== 'DRAFT') {
      throw new ConflictException('certificate_not_editable');
    }
    if (!actor.isAdmin && draft.filledById !== actor.id) {
      throw new ForbiddenException('certificate_not_owned');
    }
    return draft;
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
