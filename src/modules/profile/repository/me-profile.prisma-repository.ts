import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  MeProfileData,
  MeProfileRepository,
  MeProfileUpdate,
} from './me-profile.repository';

@Injectable()
export class PrismaMeProfileRepository implements MeProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(userId: string): Promise<MeProfileData | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, phone: true },
    });
    if (!user) return null;

    const attempt = await this.prisma.attempt.findFirst({
      where: { userId },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      select: {
        startedAt: true,
        birthDate: true,
        gender: true,
        education: true,
        test: { select: { name: true } },
      },
    });

    return {
      ...user,
      lastAttempt: attempt
        ? {
            testName: attempt.test.name,
            startedAt: attempt.startedAt,
            birthDate: attempt.birthDate,
            gender: attempt.gender,
            education: attempt.education,
          }
        : null,
    };
  }

  async update(userId: string, data: MeProfileUpdate): Promise<boolean> {
    // `updateMany` reports a missing row as a count of 0 instead of throwing.
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId },
      data,
    });
    return count > 0;
  }
}
