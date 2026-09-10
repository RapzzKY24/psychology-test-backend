import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { QRIS_REPOSITORY } from '../repository/qris.repository';
import type { QrisRepository } from '../repository/qris.repository';

@Injectable()
export class QrisService {
  constructor(
    @Inject(QRIS_REPOSITORY)
    private readonly repo: QrisRepository,
    private readonly configService: ConfigService,
  ) {}

  private getUploadDir(): string {
    const dir = this.configService.get<string>('app.uploadDir', './uploads');
    return path.resolve(dir, 'qris');
  }

  async saveImage(
    file: Express.Multer.File,
  ): Promise<{ qrisImageUrl: string }> {
    const dir = this.getUploadDir();
    await fs.promises.mkdir(dir, { recursive: true });

    // Remove old image if exists
    const existingPath = await this.repo.findQrisStoredPath();
    if (existingPath) {
      const oldFull = path.resolve(existingPath);
      if (oldFull.startsWith(path.resolve('./uploads'))) {
        await fs.promises.unlink(oldFull).catch(() => {});
      }
    }

    const ext = file.mimetype === 'image/png' ? '.png' : '.jpg';
    const filename = `${randomUUID()}${ext}`;
    const filePath = path.join(dir, filename);
    await fs.promises.writeFile(filePath, file.buffer);

    const relative = path.relative(process.cwd(), filePath);
    await this.repo.saveQrisStoredPath(relative);

    return { qrisImageUrl: `/api/v1/public/payments/qris-image` };
  }

  async getImagePath(): Promise<string> {
    const stored = await this.repo.findQrisStoredPath();
    if (!stored) throw new NotFoundException('qris_not_configured');
    // Jail to the QRIS upload dir: the stored path comes from the DB and
    // must never resolve outside it (path traversal → arbitrary file read).
    const base = `${this.getUploadDir()}${path.sep}`;
    const full = path.resolve(stored);
    if (!full.startsWith(base) || !fs.existsSync(full))
      throw new NotFoundException('qris_not_configured');
    return full;
  }
}
