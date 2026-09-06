import { Module } from '@nestjs/common';
import { InstansiParticipantsController } from './controller/instansi-participants.controller';
import { InstansiParticipantsService } from './service/instansi-participants.service';
import { InstansiParticipantsPrismaRepository } from './repository/instansi-participants.prisma-repository';
import { INSTANSI_PARTICIPANTS_REPOSITORY } from './repository/instansi-participants.repository';
import { PrismaInstitutionsRepository } from '../institutions/repository/institutions.prisma-repository';
import { INSTITUTIONS_REPOSITORY } from '../institutions/repository/institutions.repository';

@Module({
  controllers: [InstansiParticipantsController],
  providers: [
    InstansiParticipantsService,
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
