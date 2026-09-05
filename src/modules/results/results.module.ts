import { Module } from '@nestjs/common';
import { ResultsController } from './controller/results.controller';
import { MeResultsController } from './controller/me-results.controller';
import { ResultsService } from './service/results.service';
import { MeResultsService } from './service/me-results.service';
import { PrismaResultsRepository } from './repository/results.prisma-repository';
import { RESULTS_REPOSITORY } from './repository/results.repository';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [SessionsModule],
  controllers: [ResultsController, MeResultsController],
  providers: [
    ResultsService,
    MeResultsService,
    { provide: RESULTS_REPOSITORY, useClass: PrismaResultsRepository },
  ],
})
export class ResultsModule {}
