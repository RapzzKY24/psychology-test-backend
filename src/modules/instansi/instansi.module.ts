import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { TestsModule } from '../tests/tests.module';
import { InstansiParticipantsController } from './controller/instansi-participants.controller';
import { InstansiSessionsController } from './controller/instansi-sessions.controller';
import { InstansiOverviewController } from './controller/instansi-overview.controller';
import { InstansiTestsController } from './controller/instansi-tests.controller';
import { InstansiParticipantsService } from './service/instansi-participants.service';
import { InstansiSessionsService } from './service/instansi-sessions.service';
import { InstansiOverviewService } from './service/instansi-overview.service';
import { InstansiParticipantsPrismaRepository } from './repository/instansi-participants.prisma-repository';
import { INSTANSI_PARTICIPANTS_REPOSITORY } from './repository/instansi-participants.repository';
import { PrismaInstitutionsRepository } from '../institutions/repository/institutions.prisma-repository';
import { INSTITUTIONS_REPOSITORY } from '../institutions/repository/institutions.repository';

@Module({
  imports: [SessionsModule, TestsModule],
  controllers: [
    InstansiParticipantsController,
    InstansiSessionsController,
    InstansiOverviewController,
    InstansiTestsController,
  ],
  providers: [
    InstansiParticipantsService,
    InstansiSessionsService,
    InstansiOverviewService,
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
