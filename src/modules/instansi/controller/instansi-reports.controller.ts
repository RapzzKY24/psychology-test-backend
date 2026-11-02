import { Controller, Get, Param, Query, StreamableFile } from '@nestjs/common';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { QueryInstansiReportsSchema } from '../dto/query-instansi-reports.dto';
import type { QueryInstansiReportsDto } from '../dto/query-instansi-reports.dto';
import { InstansiReportsService } from '../service/instansi-reports.service';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';
import type { ReportListItem } from '../../reports/repository/reports.repository';

@Controller('api/v1/instansi/reports')
@Roles(['INSTANSI'])
export class InstansiReportsController {
  constructor(private readonly reports: InstansiReportsService) {}

  @Get()
  async list(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(QueryInstansiReportsSchema))
    query: QueryInstansiReportsDto,
  ): Promise<PaginatedResponse<ReportListItem>> {
    return this.reports.list(session.user.id, query);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Session() session: UserSession,
    @Param('id', new ZodValidationPipe(z.string().uuid())) id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.reports.renderPdf(
      session.user.id,
      id,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${filename}"`,
      length: buffer.length,
    });
  }
}
