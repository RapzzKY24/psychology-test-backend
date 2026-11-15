import { Controller, Get } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { PublicStatsService } from './public-stats.service';
import type { PublicStats } from './public-stats.service';
import type { ApiResponse } from '../../common/interfaces/api-response.interface';

/** The landing page's proof band. Counts only — nothing that names a person. */
@Controller('api/v1/public/stats')
@AllowAnonymous()
export class PublicStatsController {
  constructor(private readonly statsService: PublicStatsService) {}

  @Get()
  async getStats(): Promise<ApiResponse<PublicStats>> {
    const data = await this.statsService.getStats();
    return { data };
  }
}
