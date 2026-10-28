import {
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import type { CreateUserDto } from '../dto/create-user.dto';
import type { CreatePsychologistDto } from '../dto/create-psychologist.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';
import type {
  PsychologistProfile,
  UserRole,
} from '../../../generated/prisma/client';
import { Prisma } from '../../../generated/prisma/client';
import { ADMIN_REPOSITORY } from '../repository/admin.repository';
import type {
  AdminRepository,
  AdminUserRow,
} from '../repository/admin.repository';
import { hashPassword } from 'better-auth/crypto';
import { randomUUID } from 'crypto';

@Injectable()
export class AdminService {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly repo: AdminRepository,
  ) {}

  async listUsers(
    query: PaginationDto & { role?: UserRole },
  ): Promise<PaginatedResponse<AdminUserRow>> {
    const { data, total } = await this.repo.findUsers({
      role: query.role,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
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

  async createUser(dto: CreateUserDto): Promise<AdminUserRow> {
    const existing = await this.repo.findUserByEmail(dto.email);
    if (existing) throw new ConflictException('email already exists');

    return this.repo.createUserWithAccount({
      userId: randomUUID(),
      name: dto.name,
      email: dto.email,
      role: dto.role,
      passwordHash: await hashPassword(dto.password),
    });
  }

  async createPsychologist(dto: CreatePsychologistDto): Promise<{
    user: AdminUserRow;
    profile: PsychologistProfile;
  }> {
    const emailTaken = await this.repo.findUserByEmail(dto.email);
    if (emailTaken) throw new ConflictException('duplicate_email');

    const nikTaken = await this.repo.findProfileByNik(dto.nik);
    if (nikTaken) throw new ConflictException('duplicate_nik');

    try {
      return await this.repo.createPsychologistWithAccount({
        userId: randomUUID(),
        name: dto.name,
        email: dto.email,
        nik: dto.nik,
        institutionName: dto.institutionName,
        passwordHash: await hashPassword(dto.password),
      });
    } catch (error) {
      // Race: two concurrent creates passing the pre-checks — the DB
      // unique constraint wins; map back to 409 instead of 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const rawTarget = error.meta?.target;
        const target =
          typeof rawTarget === 'string'
            ? rawTarget
            : Array.isArray(rawTarget)
              ? rawTarget.join(',')
              : '';
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

  async updateRole(
    userId: string,
    role: UserRole,
    currentUserId: string,
  ): Promise<AdminUserRow> {
    if (userId === currentUserId)
      throw new ForbiddenException('cannot_change_own_role');

    const user = await this.repo.findUserById(userId);
    if (!user) throw new NotFoundException('user not found');

    return this.repo.updateUserRole(userId, role);
  }
}
