import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CreateUserSchema } from '../dto/create-user.dto';
import type { CreateUserDto } from '../dto/create-user.dto';
import { UpdateRoleSchema } from '../dto/update-role.dto';
import type { UpdateRoleDto } from '../dto/update-role.dto';
import { AdminService } from '../service/admin.service';
import { z } from 'zod';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import { UserRole } from '../../../generated/prisma/client';
import type { UserRole as UserRoleType } from '../../../generated/prisma/client';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';

const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  role: z.nativeEnum(UserRole).optional(),
});

@Controller('api/v1/admin/users')
export class AdminUsersController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  @Roles(['ADMIN'])
  async listUsers(
    @Query(new ZodValidationPipe(PaginationQuerySchema))
    query: PaginationDto & { role?: UserRoleType },
  ): Promise<
    PaginatedResponse<{
      id: string;
      name: string;
      email: string;
      role: string;
      createdAt: Date;
    }>
  > {
    return this.adminService.listUsers(query);
  }

  @Post()
  @Roles(['ADMIN'])
  async createUser(
    @Body(new ZodValidationPipe(CreateUserSchema)) dto: CreateUserDto,
  ) {
    const user = await this.adminService.createUser(dto);
    return { data: user };
  }

  @Patch(':id/role')
  @Roles(['ADMIN'])
  async updateRole(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateRoleSchema)) dto: UpdateRoleDto,
    @Session() session: UserSession,
  ) {
    const user = await this.adminService.updateRole(
      id,
      dto.role,
      session.user.id,
    );
    return { data: user };
  }
}
