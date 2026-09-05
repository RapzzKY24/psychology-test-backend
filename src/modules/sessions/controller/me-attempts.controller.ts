import { Controller, Get, Query } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PaginationSchema } from '../../../common/dto/pagination.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import { MeAttemptsService } from '../service/me-attempts.service';
import type { MeAttemptListItemDto } from '../dto/me-attempt.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/me/attempts')
export class MeAttemptsController {
  constructor(private readonly meAttemptsService: MeAttemptsService) {}

  // Own attempts in any status, paginated (participant attempts dashboard)
  @Get()
  async list(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<PaginatedResponse<MeAttemptListItemDto>> {
    return this.meAttemptsService.list(session.user.id, query);
  }
}
