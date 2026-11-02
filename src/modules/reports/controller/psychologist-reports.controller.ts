import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { QueryReportsSchema } from '../dto/query-reports.dto';
import type { QueryReportsDto } from '../dto/query-reports.dto';
import { SaveReportSchema } from '../dto/save-report.dto';
import type { SaveReportDto } from '../dto/save-report.dto';
import { ReportsService } from '../service/reports.service';
import type { IssuedReport, ReportForm } from '../service/reports.service';
import { ReportDocumentService } from '../service/report-document.service';
import type {
  ApiResponse,
  PaginatedResponse,
} from '../../../common/interfaces/api-response.interface';
import type {
  ReportCandidate,
  ReportListItem,
} from '../repository/reports.repository';
import { PaginationSchema } from '../../../common/dto/pagination.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';

const UuidPipe = new ZodValidationPipe(z.string().uuid());

@Controller('api/v1/psychologist/reports')
@Roles(['PSYCHOLOGIST'])
export class PsychologistReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly documents: ReportDocumentService,
  ) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(QueryReportsSchema)) query: QueryReportsDto,
  ): Promise<PaginatedResponse<ReportListItem>> {
    return this.reportsService.listReports(query);
  }

  /** Work queue — declared before `:participantId` so the literal wins. */
  @Get('pending')
  async pending(
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<PaginatedResponse<ReportCandidate>> {
    return this.reportsService.listPendingReports(query);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Param('id', UuidPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.documents.renderPdf(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${filename}"`,
      length: buffer.length,
    });
  }

  @Get(':participantId')
  async getForm(
    @Session() session: UserSession,
    @Param('participantId', UuidPipe) participantId: string,
  ): Promise<ApiResponse<ReportForm>> {
    const data = await this.reportsService.getForm(
      session.user.id,
      participantId,
    );
    return { data };
  }

  @Put(':participantId')
  async save(
    @Session() session: UserSession,
    @Param('participantId', UuidPipe) participantId: string,
    @Body(new ZodValidationPipe(SaveReportSchema)) dto: SaveReportDto,
  ): Promise<ApiResponse<ReportForm>> {
    const data = await this.reportsService.saveDraft(
      session.user.id,
      participantId,
      dto,
    );
    return { data, message: 'report_draft_saved' };
  }

  @Post(':participantId/issue')
  async issue(
    @Session() session: UserSession,
    @Param('participantId', UuidPipe) participantId: string,
  ): Promise<ApiResponse<IssuedReport>> {
    const data = await this.reportsService.issue(
      session.user.id,
      participantId,
    );
    return { data, message: 'report_issued' };
  }
}
