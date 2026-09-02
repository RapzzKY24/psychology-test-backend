import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { CreateUserDto } from '../dto/create-user.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import type { UserRole } from '../../../generated/prisma/client';
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
    if (existing) throw new ForbiddenException('email already exists');

    const hashedPassword = await hashPassword(dto.password);
    const userId = randomUUID();

    const user = await this.prisma.user.create({
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

    await this.prisma.account.create({
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
  }

  async updateRole(userId: string, role: string, currentUserId: string) {
    if (userId === currentUserId)
      throw new ForbiddenException('cannot_change_own_role');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('user not found');
    return this.prisma.user.update({ where: { id: userId }, data: { role } });
  }
}
