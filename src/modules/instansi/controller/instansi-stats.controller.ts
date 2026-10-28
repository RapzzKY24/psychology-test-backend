import { Controller, Get, Query } from '@nestjs/common';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { SessionProgressQuerySchema } from '../dto/instansi-stats.dto';
import type {
  InstansiSessionProgressStats,
  SessionProgressQueryDto,
} from '../dto/instansi-stats.dto';
import { InstansiStatsService } from '../service/instansi-stats.service';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/instansi/stats')
@Roles(['INSTANSI'])
export class InstansiStatsController {
  constructor(private readonly statsService: InstansiStatsService) {}

  @Get('progress')
  async getProgress(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(SessionProgressQuerySchema))
    query: SessionProgressQueryDto,
  ): Promise<ApiResponse<InstansiSessionProgressStats>> {
    const data = await this.statsService.getProgress(
      session.user.id,
      query.limit,
    );
    return { data };
  }
}
