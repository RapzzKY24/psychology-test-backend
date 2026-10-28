import { Controller, Get, Query } from '@nestjs/common';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ReviewStatsQuerySchema } from '../dto/psychologist-stats.dto';
import type {
  ReviewStats,
  ReviewStatsQueryDto,
} from '../dto/psychologist-stats.dto';
import { PsychologistStatsService } from '../service/psychologist-stats.service';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/psychologist/stats')
@Roles(['PSYCHOLOGIST'])
export class PsychologistStatsController {
  constructor(private readonly statsService: PsychologistStatsService) {}

  @Get('review')
  async getReviewStats(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(ReviewStatsQuerySchema))
    query: ReviewStatsQueryDto,
  ): Promise<ApiResponse<ReviewStats>> {
    const data = await this.statsService.getReviewStats(
      session.user.id,
      query.days,
    );
    return { data };
  }
}
