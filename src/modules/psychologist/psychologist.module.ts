import { Module } from '@nestjs/common';
import { PsychologistPingController } from './controller/psychologist-ping.controller';
import { PsychologistProfileController } from './controller/psychologist-profile.controller';
import { PsychologistService } from './service/psychologist.service';
import { PSYCHOLOGIST_PROFILE_REPO } from './repository/psychologist-profile.repository';
import { PrismaPsychologistProfileRepository } from './repository/psychologist-profile.prisma-repository';

@Module({
  controllers: [PsychologistPingController, PsychologistProfileController],
  providers: [
    PsychologistService,
    {
      provide: PSYCHOLOGIST_PROFILE_REPO,
      useClass: PrismaPsychologistProfileRepository,
    },
  ],
})
export class PsychologistModule {}
