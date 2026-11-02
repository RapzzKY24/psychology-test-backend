import { Controller, Get, Ip, Param } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { PublicReportsService } from '../service/public-reports.service';
import type { PublicReportVerification } from '../service/public-reports.service';

/**
 * Dipindai dari QR di halaman 1 laporan. Terpisah dari
 * `/api/v1/public/verify/:code` (hasil tes, feature 06).
 */
@Controller('api/v1/public/reports')
export class PublicReportsController {
  constructor(private readonly reports: PublicReportsService) {}

  @Get('verify/:code')
  @AllowAnonymous()
  async verify(
    @Param('code') code: string,
    @Ip() ip: string,
  ): Promise<PublicReportVerification> {
    return this.reports.verify(code, ip || 'unknown');
  }
}
