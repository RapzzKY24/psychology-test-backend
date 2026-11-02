import { Module } from '@nestjs/common';
import { ReportsService } from './service/reports.service';
import { PrismaReportsRepository } from './repository/reports.prisma-repository';
import { REPORTS_REPOSITORY } from './repository/reports.repository';

@Module({
  providers: [
    ReportsService,
    { provide: REPORTS_REPOSITORY, useClass: PrismaReportsRepository },
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
