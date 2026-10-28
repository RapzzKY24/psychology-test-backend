import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { AdminRevenueQuerySchema } from '../dto/admin-stats.dto';
import type {
  AdminRevenueQueryDto,
  AdminRevenueStats,
} from '../dto/admin-stats.dto';
import { AdminStatsService } from '../service/admin-stats.service';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/admin/stats')
@Roles(['ADMIN'])
export class AdminStatsController {
  constructor(private readonly statsService: AdminStatsService) {}

  @Get('revenue')
  async getRevenue(
    @Query(new ZodValidationPipe(AdminRevenueQuerySchema))
    query: AdminRevenueQueryDto,
  ): Promise<ApiResponse<AdminRevenueStats>> {
    const data = await this.statsService.getRevenue(query.months);
    return { data };
  }
}
