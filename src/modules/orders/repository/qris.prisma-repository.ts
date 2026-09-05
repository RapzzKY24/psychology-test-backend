import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { QrisRepository } from './qris.repository';

@Injectable()
export class PrismaQrisRepository implements QrisRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findQrisStoredPath(): Promise<string | null> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: 'payment.qrisImagePath' },
    });
    if (!setting?.value) return null;
    return (setting.value as { path?: string })?.path ?? null;
  }

  async saveQrisStoredPath(path: string): Promise<void> {
    await this.prisma.setting.upsert({
      where: { key: 'payment.qrisImagePath' },
      create: {
        key: 'payment.qrisImagePath',
        value: { path },
      },
      update: { value: { path } },
    });
  }
}
