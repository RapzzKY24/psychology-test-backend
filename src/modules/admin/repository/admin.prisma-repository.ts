import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  PsychologistProfile,
  UserRole,
} from '../../../generated/prisma/client';
import { randomUUID } from 'crypto';
import type {
  AdminRepository,
  AdminUserRow,
  CreatePsychologistInput,
  CreateUserInput,
} from './admin.repository';

const USER_ROW_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

@Injectable()
export class PrismaAdminRepository implements AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUsers(params: {
    role?: UserRole;
    skip: number;
    take: number;
  }): Promise<{ data: AdminUserRow[]; total: number }> {
    const where = params.role ? { role: params.role } : {};
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        select: USER_ROW_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, total };
  }

  findUserByEmail(email: string): Promise<{ id: string } | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
  }

  findUserById(id: string): Promise<{ id: string } | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
  }

  findProfileByNik(nik: string): Promise<{ id: string } | null> {
    return this.prisma.psychologistProfile.findUnique({
      where: { nik },
      select: { id: true },
    });
  }

  createUserWithAccount(input: CreateUserInput): Promise<AdminUserRow> {
    // Atomic: a failed account insert must not leave an orphan login-less user.
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: input.userId,
          name: input.name,
          email: input.email,
          emailVerified: true,
          role: input.role,
        },
        select: USER_ROW_SELECT,
      });

      await tx.account.create({
        data: {
          id: randomUUID(),
          accountId: input.userId,
          providerId: 'credential',
          issuer: 'local:credential',
          userId: input.userId,
          password: input.passwordHash,
        },
      });

      return user;
    });
  }

  createPsychologistWithAccount(
    input: CreatePsychologistInput,
  ): Promise<{ user: AdminUserRow; profile: PsychologistProfile }> {
    // Atomic: user + account + profile succeed or roll back together.
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: input.userId,
          name: input.name,
          email: input.email,
          emailVerified: true,
          role: 'PSYCHOLOGIST',
        },
        select: USER_ROW_SELECT,
      });

      await tx.account.create({
        data: {
          id: randomUUID(),
          accountId: input.userId,
          providerId: 'credential',
          issuer: 'local:credential',
          userId: input.userId,
          password: input.passwordHash,
        },
      });

      const profile = await tx.psychologistProfile.create({
        data: {
          userId: input.userId,
          fullName: input.name,
          degree: '',
          licenseNumber: '',
          nik: input.nik,
          institutionName: input.institutionName,
          signatureImagePath: '',
        },
      });

      return { user, profile };
    });
  }

  updateUserRole(userId: string, role: UserRole): Promise<AdminUserRow> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: USER_ROW_SELECT,
    });
  }
}
