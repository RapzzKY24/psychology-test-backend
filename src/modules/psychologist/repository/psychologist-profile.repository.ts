import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { PsychologistProfile } from '../../../generated/prisma/client';

export const PSYCHOLOGIST_PROFILE_REPO = 'PsychologistProfileRepository';

export interface PsychologistProfileRepository {
  findByUserId(userId: string): Promise<PsychologistProfile | null>;
  upsert(
    userId: string,
    data: { fullName: string; degree: string; licenseNumber: string },
  ): Promise<PsychologistProfile>;
  updateSignature(
    userId: string,
    signatureImagePath: string,
  ): Promise<PsychologistProfile>;
}

@Injectable()
export class PrismaPsychologistProfileRepository implements PsychologistProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<PsychologistProfile | null> {
    return this.prisma.psychologistProfile.findUnique({ where: { userId } });
  }

  async upsert(
    userId: string,
    data: { fullName: string; degree: string; licenseNumber: string },
  ): Promise<PsychologistProfile> {
    return this.prisma.psychologistProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data, signatureImagePath: '' },
    });
  }

  async updateSignature(
    userId: string,
    signatureImagePath: string,
  ): Promise<PsychologistProfile> {
    return this.prisma.psychologistProfile.upsert({
      where: { userId },
      update: { signatureImagePath },
      create: {
        userId,
        fullName: '',
        degree: '',
        licenseNumber: '',
        signatureImagePath,
      },
    });
  }
}
