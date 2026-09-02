import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PaginationSchema } from '../../../common/dto/pagination.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreateSessionSchema } from '../dto/create-session.dto';
import type { CreateSessionDto } from '../dto/create-session.dto';
import { SessionsService } from '../service/sessions.service';
import type { TestSession } from '../../../generated/prisma/client';
import type {
  ApiResponse,
  PaginatedResponse,
} from '../../../common/interfaces/api-response.interface';
import type { SessionDetail } from '../repository/sessions.repository';

@Controller('api/v1/admin/sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @Roles(['ADMIN'])
  async create(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(CreateSessionSchema)) dto: CreateSessionDto,
  ): Promise<ApiResponse<TestSession>> {
    const data = await this.sessionsService.create(dto, session.user.id);
    return { data, message: 'Session created' };
  }

  @Get()
  @Roles(['ADMIN'])
  async findMany(
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<PaginatedResponse<TestSession>> {
    return this.sessionsService.findMany(query);
  }

  @Get(':id')
  @Roles(['ADMIN'])
  async findDetail(
    @Param('id') id: string,
  ): Promise<ApiResponse<SessionDetail>> {
    const data = await this.sessionsService.findDetail(id);
    return { data };
  }

  @Post(':id/close')
  @Roles(['ADMIN'])
  async close(@Param('id') id: string): Promise<ApiResponse<TestSession>> {
    const data = await this.sessionsService.close(id);
    return { data };
  }
}
