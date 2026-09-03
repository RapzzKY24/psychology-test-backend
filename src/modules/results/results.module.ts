import { Module } from '@nestjs/common';
import { ResultsController } from './controller/results.controller';
import { ResultsService } from './service/results.service';
import { PrismaResultsRepository } from './repository/results.prisma-repository';
import { RESULTS_REPOSITORY } from './repository/results.repository';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [SessionsModule],
  controllers: [ResultsController],
  providers: [
    ResultsService,
    { provide: RESULTS_REPOSITORY, useClass: PrismaResultsRepository },
  ],
})
export class ResultsModule {}
