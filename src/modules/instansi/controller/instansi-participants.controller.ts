import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PaginationSchema } from '../../../common/dto/pagination.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import { InstansiParticipantsService } from '../service/instansi-participants.service';
import type { InstitutionParticipant } from '../../../generated/prisma/client';
import type {
  ApiResponse,
  PaginatedResponse,
} from '../../../common/interfaces/api-response.interface';
import {
  CreateInstansiParticipantSchema,
  UpdateInstansiParticipantSchema,
} from '../dto/create-instansi-participant.dto';
import type {
  CreateInstansiParticipantDto,
  UpdateInstansiParticipantDto,
} from '../dto/create-instansi-participant.dto';

@Controller('api/v1/instansi/participants')
@Roles(['INSTANSI'])
export class InstansiParticipantsController {
  constructor(
    private readonly participantsService: InstansiParticipantsService,
  ) {}

  @Get()
  async list(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<PaginatedResponse<InstitutionParticipant>> {
    const institutionId = await this.participantsService.resolveInstitutionId(
      session.user.id,
    );
    return this.participantsService.list(institutionId, query);
  }

  @Get(':id')
  async get(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<ApiResponse<InstitutionParticipant>> {
    const institutionId = await this.participantsService.resolveInstitutionId(
      session.user.id,
    );
    return this.participantsService.get(id, institutionId);
  }

  @Post()
  async create(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(CreateInstansiParticipantSchema))
    dto: CreateInstansiParticipantDto,
  ): Promise<ApiResponse<InstitutionParticipant>> {
    const institutionId = await this.participantsService.resolveInstitutionId(
      session.user.id,
    );
    return this.participantsService.create(institutionId, {
      ...dto,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
    });
  }

  @Patch(':id')
  async update(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateInstansiParticipantSchema))
    dto: UpdateInstansiParticipantDto,
  ): Promise<ApiResponse<InstitutionParticipant>> {
    const institutionId = await this.participantsService.resolveInstitutionId(
      session.user.id,
    );
    return this.participantsService.update(id, institutionId, {
      ...dto,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
    });
  }

  @Delete(':id')
  async remove(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<ApiResponse<{ id: string }>> {
    const institutionId = await this.participantsService.resolveInstitutionId(
      session.user.id,
    );
    await this.participantsService.remove(id, institutionId);
    return { data: { id }, message: 'participant_deleted' };
  }
}
