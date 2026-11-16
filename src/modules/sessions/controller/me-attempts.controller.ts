import {
  Body, Controller, Get, Param, Post, Put, Query,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { FileInterceptor } from '@nestjs/platform-express';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PaginationSchema } from '../../../common/dto/pagination.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import { MeAttemptsService } from '../service/me-attempts.service';
import { AttemptsService } from '../service/attempts.service';
import {
  ReadAttemptQuerySchema,
  type ReadAttemptQueryDto,
} from '../dto/read-attempt-query.dto';
import { PutResponseSchema, type PutResponseDto } from '../dto/put-response.dto';
import { validateAttemptImage } from '../utils/validate-attempt-image';
import type {
  AttemptReadDto,
  AttemptCompleteResponseDto,
} from '../dto/attempt-read.dto';
import type { MeAttemptListItemDto } from '../dto/me-attempt.dto';
import type {
  ApiResponse,
  PaginatedResponse,
} from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/me/attempts')
export class MeAttemptsController {
  constructor(
    private readonly meAttemptsService: MeAttemptsService,
    private readonly attemptsService: AttemptsService,
  ) {}

  // Active account-owned attempts, paginated for the participant dashboard.
  @Get()
  async list(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<PaginatedResponse<MeAttemptListItemDto>> {
    return this.meAttemptsService.list(session.user.id, query);
  }

  @Get(':id')
  async read(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(ReadAttemptQuerySchema))
    query: ReadAttemptQueryDto,
  ): Promise<ApiResponse<AttemptReadDto>> {
    const data = await this.attemptsService.read(
      id,
      { userId: session.user.id },
      query.birthDate,
      query.gender,
      query.education,
    );
    return { data };
  }

  @Put(':id/responses')
  async respond(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(PutResponseSchema)) dto: PutResponseDto,
  ): Promise<ApiResponse<{ itemId: string }>> {
    await this.attemptsService.respond(id, dto, { userId: session.user.id });
    return { data: { itemId: dto.itemId }, message: 'Response saved' };
  }

  @Post(':id/items/:itemId/image')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  async uploadItemImage(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File,
    @Session() session: UserSession,
  ): Promise<ApiResponse<{ imageUrl: string }>> {
    validateAttemptImage(file);
    const data = await this.attemptsService.saveItemImage(
      id,
      itemId,
      { userId: session.user.id },
      file,
    );
    return { data };
  }

  @Post(':id/complete')
  async complete(
    @Param('id') id: string,
    @Session() session: UserSession,
  ): Promise<ApiResponse<AttemptCompleteResponseDto>> {
    const data = await this.attemptsService.complete(id, {
      userId: session.user.id,
    });
    return { data };
  }
}
