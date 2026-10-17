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
import { InstansiSessionsService } from '../service/instansi-sessions.service';
import type {
  InstansiBatchCreateResult,
  ResetSeatResult,
} from '../service/instansi-sessions.service';
import { CreateInstansiSessionSchema } from '../dto/create-instansi-session.dto';
import type { CreateInstansiSessionDto } from '../dto/create-instansi-session.dto';
import { AddBatchParticipantsSchema } from '../dto/add-batch-participants.dto';
import type { AddBatchParticipantsDto } from '../dto/add-batch-participants.dto';
import { SwapBatchParticipantSchema } from '../dto/swap-batch-participant.dto';
import type { SwapBatchParticipantDto } from '../dto/swap-batch-participant.dto';
import type { InstansiInvoiceDto } from '../dto/instansi-invoice.dto';
import type {
  ApiResponse,
  PaginatedResponse,
} from '../../../common/interfaces/api-response.interface';
import type { TestSession } from '../../../generated/prisma/client';
import type { SessionDetail } from '../../sessions/repository/sessions.repository';

@Controller('api/v1/instansi/sessions')
@Roles(['INSTANSI'])
export class InstansiSessionsController {
  constructor(private readonly sessionsService: InstansiSessionsService) {}

  @Post()
  async create(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(CreateInstansiSessionSchema))
    dto: CreateInstansiSessionDto,
  ): Promise<ApiResponse<InstansiBatchCreateResult>> {
    const data = await this.sessionsService.create(session.user.id, dto);
    return { data, message: 'session_created' };
  }

  @Get()
  async list(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<PaginatedResponse<TestSession>> {
    return this.sessionsService.list(session.user.id, query);
  }

  @Get(':id')
  async getDetail(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<ApiResponse<SessionDetail>> {
    const data = await this.sessionsService.getDetail(session.user.id, id);
    return { data };
  }

  @Post(':id/close')
  async close(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<ApiResponse<TestSession>> {
    const data = await this.sessionsService.close(session.user.id, id);
    return { data };
  }

  @Post(':id/participants')
  async addParticipants(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AddBatchParticipantsSchema))
    dto: AddBatchParticipantsDto,
  ): Promise<ApiResponse<InstansiInvoiceDto>> {
    const data = await this.sessionsService.addParticipants(
      session.user.id,
      id,
      dto,
    );
    return { data, message: 'participants_added' };
  }

  @Patch(':id/participants/:participantId')
  async swapParticipant(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body(new ZodValidationPipe(SwapBatchParticipantSchema))
    dto: SwapBatchParticipantDto,
  ): Promise<ApiResponse<InstansiInvoiceDto>> {
    const data = await this.sessionsService.swapParticipant(
      session.user.id,
      id,
      participantId,
      dto,
    );
    return { data, message: 'participant_updated' };
  }

  @Post(':id/participants/:participantId/reset')
  async resetParticipant(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
  ): Promise<ApiResponse<ResetSeatResult>> {
    const data = await this.sessionsService.resetParticipant(
      session.user.id,
      id,
      participantId,
    );
    return { data, message: 'seat_reset' };
  }

  @Delete(':id/participants/:participantId')
  async removeParticipant(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
  ): Promise<ApiResponse<InstansiInvoiceDto>> {
    const data = await this.sessionsService.removeParticipant(
      session.user.id,
      id,
      participantId,
    );
    return { data, message: 'participant_removed' };
  }
}
