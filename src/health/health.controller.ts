import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { HealthService } from './health.service';

@Controller('api/v1/health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @AllowAnonymous()
  async check(@Res() res: Response): Promise<void> {
    const isUp = await this.healthService.isDbUp();
    if (isUp) {
      res.status(200).json({ status: 'ok', db: 'up' });
      return;
    }
    res.status(503).json({ status: 'error', db: 'down' });
  }
}
