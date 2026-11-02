import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ReviseReportSchema } from '../dto/revise-report.dto';
import type { ReviseReportDto } from '../dto/revise-report.dto';
import { RevokeReportSchema } from '../dto/revise-report.dto';
import type { RevokeReportDto } from '../dto/revise-report.dto';
import { AdminReportsService } from '../service/admin-reports.service';
import type {
  BackfillResult,
  RevisedReport,
} from '../service/admin-reports.service';
import { BackfillReportsSchema } from '../dto/backfill-reports.dto';
import type { BackfillReportsDto } from '../dto/backfill-reports.dto';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';

const UuidPipe = new ZodValidationPipe(z.string().uuid());

@Controller('api/v1/admin/reports')
@Roles(['ADMIN'])
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  /** One-off migration for participants who finished before this feature. */
  @Post('backfill')
  async backfill(
    @Body(new ZodValidationPipe(BackfillReportsSchema)) dto: BackfillReportsDto,
  ): Promise<ApiResponse<BackfillResult>> {
    const data = await this.reports.backfill(dto);
    return { data, message: 'report_backfill_done' };
  }

  @Patch(':id')
  async revise(
    @Session() session: UserSession,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(ReviseReportSchema)) dto: ReviseReportDto,
  ): Promise<ApiResponse<RevisedReport>> {
    const data = await this.reports.revise(id, session.user.id, dto);
    return { data, message: 'report_revised' };
  }

  @Post(':id/revoke')
  async revoke(
    @Session() session: UserSession,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(RevokeReportSchema)) dto: RevokeReportDto,
  ): Promise<ApiResponse<{ id: string; status: string; revokedAt: Date }>> {
    const data = await this.reports.revoke(id, session.user.id, dto.reason);
    return { data, message: 'report_revoked' };
  }
}
