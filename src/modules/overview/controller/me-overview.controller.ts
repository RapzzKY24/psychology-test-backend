import { Controller, Get } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { MeOverviewService } from '../service/me-overview.service';
import type { MeOverviewDto } from '../dto/me-overview.dto';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/me/overview')
export class MeOverviewController {
  constructor(private readonly overview: MeOverviewService) {}

  /** Counts plus the three newest rows of each kind, for the dashboard home. */
  @Get()
  async get(
    @Session() session: UserSession,
  ): Promise<ApiResponse<MeOverviewDto>> {
    const data = await this.overview.get(session.user.id);
    return { data };
  }
}
