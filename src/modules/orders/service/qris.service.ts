import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class QrisService {
  constructor(private readonly prisma: PrismaService) {}

  private getUploadDir(): string {
    const dir = process.env.UPLOAD_DIR ?? './uploads';
    return path.resolve(dir, 'qris');
  }

  async saveImage(
    file: Express.Multer.File,
  ): Promise<{ qrisImageUrl: string }> {
    const dir = this.getUploadDir();
    await fs.promises.mkdir(dir, { recursive: true });

    // Remove old image if exists
    const existing = await this.prisma.setting.findUnique({
      where: { key: 'payment.qrisImagePath' },
    });
    if (existing?.value) {
      const old = (existing.value as { path?: string })?.path;
      if (old) {
        const oldFull = path.resolve(old);
        if (oldFull.startsWith(path.resolve('./uploads'))) {
          await fs.promises.unlink(oldFull).catch(() => {});
        }
      }
    }

    const ext = file.mimetype === 'image/png' ? '.png' : '.jpg';
    const filename = `${randomUUID()}${ext}`;
    const filePath = path.join(dir, filename);
    await fs.promises.writeFile(filePath, file.buffer);

    const relative = path.relative(process.cwd(), filePath);
    await this.prisma.setting.upsert({
      where: { key: 'payment.qrisImagePath' },
      create: {
        key: 'payment.qrisImagePath',
        value: { path: relative } as never,
      },
      update: { value: { path: relative } as never },
    });

    return { qrisImageUrl: `/api/v1/public/payments/qris-image` };
  }

  async getImagePath(): Promise<string> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: 'payment.qrisImagePath' },
    });
    if (!setting?.value) throw new NotFoundException('qris_not_configured');
    const p = (setting.value as { path?: string })?.path;
    if (!p) throw new NotFoundException('qris_not_configured');
    const full = path.resolve(p);
    if (!fs.existsSync(full))
      throw new NotFoundException('qris_not_configured');
    return full;
  }
}
