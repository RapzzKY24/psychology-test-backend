import { Module } from '@nestjs/common';
import { MeOverviewController } from './controller/me-overview.controller';
import { MeOverviewService } from './service/me-overview.service';
import { PrismaMeOverviewRepository } from './repository/me-overview.prisma-repository';
import { ME_OVERVIEW_REPOSITORY } from './repository/me-overview.repository';

@Module({
  controllers: [MeOverviewController],
  providers: [
    MeOverviewService,
    { provide: ME_OVERVIEW_REPOSITORY, useClass: PrismaMeOverviewRepository },
  ],
})
export class OverviewModule {}
