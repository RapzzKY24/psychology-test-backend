import { Module } from '@nestjs/common';
import { PsychologistModule } from '../psychologist/psychologist.module';
import { PublicStatsController } from './public-stats.controller';
import { PublicStatsService } from './public-stats.service';

@Module({
  imports: [PsychologistModule],
  controllers: [PublicStatsController],
  providers: [PublicStatsService],
})
export class PublicStatsModule {}
