import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PSYCHOLOGIST_PROFILE_REPO } from '../repository/psychologist-profile.repository';
import type { PsychologistProfileRepository } from '../repository/psychologist-profile.repository';
import type { PsychologistProfile } from '../../../generated/prisma/client';
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
      !!profile.degree &&
      !!profile.licenseNumber &&
      !!profile.signatureImagePath;
    return { profile, complete };
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<PsychologistProfile> {
    return this.repo.upsert(userId, dto);
  }

  async updateSignature(
    userId: string,
    signatureImagePath: string,
  ): Promise<PsychologistProfile> {
    return this.repo.updateSignature(userId, signatureImagePath);
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
