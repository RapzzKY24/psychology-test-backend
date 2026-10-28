import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { PsychologistProfile } from '../../../generated/prisma/client';
import type {
  PsychologistProfileRepository,
  UpsertPsychologistProfileInput,
} from './psychologist-profile.repository';

@Injectable()
export class PrismaPsychologistProfileRepository implements PsychologistProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<PsychologistProfile | null> {
    return this.prisma.psychologistProfile.findUnique({ where: { userId } });
  }

  upsert(
    userId: string,
    data: UpsertPsychologistProfileInput,
  ): Promise<PsychologistProfile> {
    return this.prisma.psychologistProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data, signatureImagePath: '' },
    });
  }

  updateSignature(
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
