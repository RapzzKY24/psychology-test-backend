import { Module } from '@nestjs/common';
import { ReportsService } from './service/reports.service';
import { PrismaReportsRepository } from './repository/reports.prisma-repository';
import { REPORTS_REPOSITORY } from './repository/reports.repository';
import { ReportAssetsService } from './pdf/report-assets';
import { ReportPdfService } from './pdf/report-pdf.service';

@Module({
  providers: [
    ReportsService,
    ReportAssetsService,
    ReportPdfService,
    { provide: REPORTS_REPOSITORY, useClass: PrismaReportsRepository },
  ],
  exports: [ReportsService, ReportAssetsService, ReportPdfService],
})
export class ReportsModule {}
