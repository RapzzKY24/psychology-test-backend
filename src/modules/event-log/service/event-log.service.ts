import { Inject, Injectable } from '@nestjs/common';
import { RecordEventSchema } from '../dto/event-log.dto';
import type {
  FindStaleInput,
  MarkFailedInput,
  MarkProcessedInput,
  RecordEventInput,
} from '../dto/event-log.dto';
import { EVENT_LOG_REPOSITORY } from '../repository/event-log.repository';
import type {
  EventLogRecord,
  EventLogRepository,
} from '../repository/event-log.repository';

@Injectable()
export class EventLogService {
  constructor(
    @Inject(EVENT_LOG_REPOSITORY)
    private readonly repo: EventLogRepository,
  ) {}

  async record(input: RecordEventInput): Promise<EventLogRecord> {
    return this.repo.create(RecordEventSchema.parse(input));
  }

  markProcessing(id: string): Promise<void> {
    return this.repo.markProcessing(id);
  }

  markProcessed(id: string, result: MarkProcessedInput): Promise<void> {
    return this.repo.markProcessed(id, result);
  }

  markFailed(id: string, result: MarkFailedInput): Promise<void> {
    return this.repo.markFailed(id, result);
  }

  findStaleForRecovery(params: FindStaleInput): Promise<EventLogRecord[]> {
    return this.repo.findStaleForRecovery(params);
  }
}
