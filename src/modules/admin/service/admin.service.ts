import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { CreateUserDto } from '../dto/create-user.dto';
import type { CreatePsychologistDto } from '../dto/create-psychologist.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import type {
  PsychologistProfile,
  UserRole,
} from '../../../generated/prisma/client';
import { Prisma } from '../../../generated/prisma/client';
import { hashPassword } from 'better-auth/crypto';
import { randomUUID } from 'crypto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(query: PaginationDto & { role?: UserRole }): Promise<{
    data: {
      id: string;
      name: string;
      email: string;
      role: string;
      createdAt: Date;
    }[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const where = query.role ? { role: query.role } : {};
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async createUser(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('email already exists');

    const hashedPassword = await hashPassword(dto.password);
    const userId = randomUUID();

    // Atomic: a failed account insert must not leave an orphan login-less user.
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: userId,
          name: dto.name,
          email: dto.email,
          emailVerified: true,
          role: dto.role,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });

      await tx.account.create({
        data: {
          id: randomUUID(),
          accountId: userId,
          providerId: 'credential',
          issuer: 'local:credential',
          userId,
          password: hashedPassword,
        },
      });

      return user;
    });
  }

  async createPsychologist(dto: CreatePsychologistDto): Promise<{
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      createdAt: Date;
    };
    profile: PsychologistProfile;
  }> {
    const emailTaken = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (emailTaken) throw new ConflictException('duplicate_email');

    const nikTaken = await this.prisma.psychologistProfile.findUnique({
      where: { nik: dto.nik },
    });
    if (nikTaken) throw new ConflictException('duplicate_nik');

    const hashedPassword = await hashPassword(dto.password);
    const userId = randomUUID();

    // Atomic: user + account + profile succeed or roll back together.
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            id: userId,
            name: dto.name,
            email: dto.email,
            emailVerified: true,
            role: 'PSYCHOLOGIST',
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
          },
        });

        await tx.account.create({
          data: {
            id: randomUUID(),
            accountId: userId,
            providerId: 'credential',
            issuer: 'local:credential',
            userId,
            password: hashedPassword,
          },
        });

        const profile = await tx.psychologistProfile.create({
          data: {
            userId,
            fullName: dto.name,
            degree: '',
            licenseNumber: '',
            nik: dto.nik,
            institutionName: dto.institutionName,
            signatureImagePath: '',
          },
        });

        return { user, profile };
      });
    } catch (error) {
      // Race: two concurrent creates passing the pre-checks — the DB
      // unique constraint wins; map back to 409 instead of 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const target = String(error.meta?.target ?? '');
        if (error.code === 'P2002' && target.includes('nik')) {
          throw new ConflictException('duplicate_nik');
        }
        if (error.code === 'P2002') {
          throw new ConflictException('duplicate_email');
        }
      }
      throw error;
    }
  }

  async updateRole(userId: string, role: string, currentUserId: string) {
    if (userId === currentUserId)
      throw new ForbiddenException('cannot_change_own_role');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('user not found');
    return this.prisma.user.update({ where: { id: userId }, data: { role } });
  }
}
