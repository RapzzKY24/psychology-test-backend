import { Module } from '@nestjs/common';
import { MeProfileController } from './controller/me-profile.controller';
import { MeProfileService } from './service/me-profile.service';
import { PrismaMeProfileRepository } from './repository/me-profile.prisma-repository';
import { ME_PROFILE_REPOSITORY } from './repository/me-profile.repository';

@Module({
  controllers: [MeProfileController],
  providers: [
    MeProfileService,
    { provide: ME_PROFILE_REPOSITORY, useClass: PrismaMeProfileRepository },
  ],
})
export class ProfileModule {}
