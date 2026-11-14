import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { SessionParticipant } from '../../../generated/prisma/client';
import { Participant } from '../../../common/decorators/participant.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ParticipantTokenGuard } from '../guards/participant-token.guard';
import { PutResponseSchema } from '../dto/put-response.dto';
import type { PutResponseDto } from '../dto/put-response.dto';
import {
  ReadAttemptQuerySchema,
  type ReadAttemptQueryDto,
} from '../dto/read-attempt-query.dto';
import { AttemptsService } from '../service/attempts.service';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';
import type {
  AttemptReadDto,
  AttemptCompleteResponseDto,
} from '../dto/attempt-read.dto';

@Controller('api/v1/public/attempts')
@UseGuards(ParticipantTokenGuard)
@AllowAnonymous()
export class AttemptsPublicController {
  constructor(private readonly attemptsService: AttemptsService) {}

  @Get(':id')
  async read(
    @Param('id') id: string,
    @Participant() participant: SessionParticipant,
    @Query(new ZodValidationPipe(ReadAttemptQuerySchema))
    query: ReadAttemptQueryDto,
  ): Promise<ApiResponse<AttemptReadDto>> {
    const data = await this.attemptsService.read(
      id,
      participant.id,
      query.birthDate,
      query.gender,
    );
    return { data };
  }

  @Put(':id/responses')
  async respond(
    @Param('id') id: string,
    @Participant() participant: SessionParticipant,
    @Body(new ZodValidationPipe(PutResponseSchema)) dto: PutResponseDto,
  ): Promise<ApiResponse<{ itemId: string }>> {
    await this.attemptsService.respond(id, dto, participant.id);
    return { data: { itemId: dto.itemId }, message: 'Response saved' };
  }

  @Post(':id/complete')
  async complete(
    @Param('id') id: string,
    @Participant() participant: SessionParticipant,
  ): Promise<ApiResponse<AttemptCompleteResponseDto>> {
    const data = await this.attemptsService.complete(id, participant.id);
    return { data, message: 'Attempt completed' };
  }
}
