import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { HealthService } from './health.service';
import type { ApiResponse } from '../../common/interfaces/api-response.interface';

@Controller('api/v1/health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @AllowAnonymous()
  async check(): Promise<ApiResponse<{ status: string; db: string }>> {
    const isUp = await this.healthService.isDbUp();
    if (!isUp) {
      throw new ServiceUnavailableException('Database unreachable');
    }
    return { data: { status: 'ok', db: 'up' } };
  }
}
