import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { TestsModule } from '../tests/tests.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { ResultsModule } from '../results/results.module';
import { ReportsModule } from '../reports/reports.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { InstansiParticipantsController } from './controller/instansi-participants.controller';
import { InstansiSessionsController } from './controller/instansi-sessions.controller';
import { InstansiInvoicesController } from './controller/instansi-invoices.controller';
import { InstansiResultsController } from './controller/instansi-results.controller';
import { InstansiOverviewController } from './controller/instansi-overview.controller';
import { InstansiTestsController } from './controller/instansi-tests.controller';
import { InstansiStatsController } from './controller/instansi-stats.controller';
import { InstansiReportsController } from './controller/instansi-reports.controller';
import { InstansiCertificatesController } from './controller/instansi-certificates.controller';
import { InstansiParticipantsService } from './service/instansi-participants.service';
import { InstansiTestsService } from './service/instansi-tests.service';
import { InstansiSessionsService } from './service/instansi-sessions.service';
import { InstansiInvoicesService } from './service/instansi-invoices.service';
import { InstansiResultsService } from './service/instansi-results.service';
import { InstansiOverviewService } from './service/instansi-overview.service';
import { InstansiStatsService } from './service/instansi-stats.service';
import { InstansiReportsService } from './service/instansi-reports.service';
import { InstansiCertificatesService } from './service/instansi-certificates.service';
import { INSTANSI_STATS_REPOSITORY } from './repository/instansi-stats.repository';
import { PrismaInstansiStatsRepository } from './repository/instansi-stats.prisma-repository';
import { InstansiParticipantsPrismaRepository } from './repository/instansi-participants.prisma-repository';
import { INSTANSI_PARTICIPANTS_REPOSITORY } from './repository/instansi-participants.repository';
import { PrismaInstitutionsRepository } from '../institutions/repository/institutions.prisma-repository';
import { INSTITUTIONS_REPOSITORY } from '../institutions/repository/institutions.repository';

@Module({
  imports: [
    SessionsModule,
    TestsModule,
    InvoicesModule,
    ResultsModule,
    ReportsModule,
    CertificatesModule,
  ],
  controllers: [
    InstansiParticipantsController,
    InstansiSessionsController,
    InstansiInvoicesController,
    InstansiResultsController,
    InstansiOverviewController,
    InstansiTestsController,
    InstansiStatsController,
    InstansiReportsController,
    InstansiCertificatesController,
  ],
  providers: [
    InstansiParticipantsService,
    InstansiTestsService,
    InstansiSessionsService,
    InstansiInvoicesService,
    InstansiResultsService,
    InstansiOverviewService,
    InstansiStatsService,
    InstansiReportsService,
    InstansiCertificatesService,
    {
      provide: INSTANSI_STATS_REPOSITORY,
      useClass: PrismaInstansiStatsRepository,
    },
    {
      provide: INSTANSI_PARTICIPANTS_REPOSITORY,
      useClass: InstansiParticipantsPrismaRepository,
    },
    {
      provide: INSTITUTIONS_REPOSITORY,
      useClass: PrismaInstitutionsRepository,
    },
  ],
})
export class InstansiModule {}
