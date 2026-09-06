import { Module } from '@nestjs/common';
import { InstansiParticipantsController } from './controller/instansi-participants.controller';
import { InstansiParticipantsService } from './service/instansi-participants.service';
import { InstansiParticipantsPrismaRepository } from './repository/instansi-participants.prisma-repository';
import { INSTANSI_PARTICIPANTS_REPOSITORY } from './repository/instansi-participants.repository';

@Module({
  controllers: [InstansiParticipantsController],
  providers: [
    InstansiParticipantsService,
    {
      provide: INSTANSI_PARTICIPANTS_REPOSITORY,
      useClass: InstansiParticipantsPrismaRepository,
    },
  ],
})
export class InstansiModule {}
