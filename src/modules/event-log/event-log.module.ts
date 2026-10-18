import { Module } from '@nestjs/common';
import { EventLogService } from './service/event-log.service';
import { PrismaEventLogRepository } from './repository/event-log.prisma-repository';
import { EVENT_LOG_REPOSITORY } from './repository/event-log.repository';

@Module({
  providers: [
    EventLogService,
    { provide: EVENT_LOG_REPOSITORY, useClass: PrismaEventLogRepository },
  ],
  exports: [EventLogService],
})
export class EventLogModule {}
