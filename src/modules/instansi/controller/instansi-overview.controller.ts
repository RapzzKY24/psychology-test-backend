import { Controller, Get } from '@nestjs/common';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { InstansiOverviewService } from '../service/instansi-overview.service';
import type { InstansiOverview } from '../service/instansi-overview.service';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/instansi/overview')
@Roles(['INSTANSI'])
export class InstansiOverviewController {
  constructor(private readonly overviewService: InstansiOverviewService) {}

  @Get()
  async get(
    @Session() session: UserSession,
  ): Promise<ApiResponse<InstansiOverview>> {
    const data = await this.overviewService.getOverview(session.user.id);
    return { data };
  }
}
