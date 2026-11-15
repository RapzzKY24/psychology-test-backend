import { Module } from '@nestjs/common';
import { PsychologistPingController } from './controller/psychologist-ping.controller';
import { PsychologistProfileController } from './controller/psychologist-profile.controller';
import { PsychologistStatsController } from './controller/psychologist-stats.controller';
import { PublicPsychologistsController } from './controller/public-psychologists.controller';
import { PsychologistService } from './service/psychologist.service';
import { PsychologistStatsService } from './service/psychologist-stats.service';
import { PSYCHOLOGIST_PROFILE_REPO } from './repository/psychologist-profile.repository';
import { PrismaPsychologistProfileRepository } from './repository/psychologist-profile.prisma-repository';
import { PSYCHOLOGIST_STATS_REPOSITORY } from './repository/psychologist-stats.repository';
import { PrismaPsychologistStatsRepository } from './repository/psychologist-stats.prisma-repository';

@Module({
  controllers: [
    PsychologistPingController,
    PsychologistProfileController,
    PsychologistStatsController,
    PublicPsychologistsController,
  ],
  providers: [
    PsychologistService,
    PsychologistStatsService,
    {
      provide: PSYCHOLOGIST_PROFILE_REPO,
      useClass: PrismaPsychologistProfileRepository,
    },
    {
      provide: PSYCHOLOGIST_STATS_REPOSITORY,
      useClass: PrismaPsychologistStatsRepository,
    },
  ],
})
export class PsychologistModule {}
