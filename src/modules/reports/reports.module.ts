import { Module } from '@nestjs/common';
import { ReportsService } from './service/reports.service';
import { PrismaReportsRepository } from './repository/reports.prisma-repository';
import { REPORTS_REPOSITORY } from './repository/reports.repository';
import { ReportAssetsService } from './pdf/report-assets';
import { ReportPdfService } from './pdf/report-pdf.service';
import { ReportDocumentService } from './service/report-document.service';
import { PsychologistReportsController } from './controller/psychologist-reports.controller';

@Module({
  controllers: [PsychologistReportsController],
  providers: [
    ReportsService,
    ReportDocumentService,
    ReportAssetsService,
    ReportPdfService,
    { provide: REPORTS_REPOSITORY, useClass: PrismaReportsRepository },
  ],
  exports: [ReportsService, ReportDocumentService],
})
export class ReportsModule {}
