import {
  Injectable,
  Inject,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PSYCHOLOGIST_PROFILE_REPO } from '../repository/psychologist-profile.repository';
import type { PsychologistProfileRepository } from '../repository/psychologist-profile.repository';
import type { PsychologistProfile } from '../../../generated/prisma/client';
import { Prisma } from '../../../generated/prisma/client';
import type { UpdateProfileDto } from '../dto/update-profile.dto';
import { validateImageFile } from '../utils/validate-image-file';
import { generateSignatureFilename } from '../utils/generate-signature-filename';
import { ensureUploadDir } from '../utils/ensure-upload-dir';
import * as fs from 'fs';
import * as path from 'path';
import type { Express } from 'express';

@Injectable()
export class PsychologistService {
  constructor(
    @Inject(PSYCHOLOGIST_PROFILE_REPO)
    private readonly repo: PsychologistProfileRepository,
    private readonly configService: ConfigService,
  ) {}

  async getProfile(
    userId: string,
  ): Promise<{ profile: PsychologistProfile | null; complete: boolean }> {
    const profile = await this.repo.findByUserId(userId);
    const complete =
      !!profile &&
      !!profile.fullName &&
      !!profile.licenseNumber &&
      !!profile.signatureImagePath;
    return { profile, complete };
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<PsychologistProfile> {
    try {
      return await this.repo.upsert(userId, dto);
    } catch (error) {
      // NIK belongs to another psychologist — the DB unique constraint
      // wins; map back to 409 instead of 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const rawTarget = error.meta?.target;
        const targetText = Array.isArray(rawTarget)
          ? rawTarget
              .filter((entry): entry is string => typeof entry === 'string')
              .join(' ')
          : '';
        if (error.code === 'P2002' && targetText.includes('nik')) {
          throw new ConflictException('duplicate_nik');
        }
      }
      throw error;
    }
  }

  async updateSignature(
    userId: string,
    signatureImagePath: string,
  ): Promise<PsychologistProfile> {
    return this.repo.updateSignature(userId, signatureImagePath);
  }

  async getSignaturePath(userId: string): Promise<string> {
    const profile = await this.repo.findByUserId(userId);
    const stored = profile?.signatureImagePath;
    if (!stored) throw new NotFoundException('signature_not_found');
    // Jail to the upload dir: the stored path comes from the DB and
    // must never resolve outside it (path traversal → arbitrary file read).
    const uploadDir = this.configService.get<string>(
      'app.uploadDir',
      './uploads',
    );
    const base = `${path.resolve(uploadDir)}${path.sep}`;
    const full = path.resolve(stored);
    if (!full.startsWith(base) || !fs.existsSync(full))
      throw new NotFoundException('signature_not_found');
    return full;
  }

  async saveSignature(
    userId: string,
    file: Express.Multer.File,
  ): Promise<PsychologistProfile> {
    validateImageFile(file);
    const uploadDir = this.configService.get<string>(
      'app.uploadDir',
      './uploads',
    );
    await ensureUploadDir(uploadDir);
    const filename = generateSignatureFilename(
      file.originalname,
      file.mimetype,
    );
    const filepath = path.join(uploadDir, filename);
    await fs.promises.writeFile(filepath, file.buffer);
    return this.repo.updateSignature(userId, filepath);
  }
}
