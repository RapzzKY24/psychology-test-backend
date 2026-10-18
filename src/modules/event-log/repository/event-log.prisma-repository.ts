import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { EventLog, Prisma } from '../../../generated/prisma/client';
import type { MarkFailedInput, MarkProcessedInput } from '../dto/event-log.dto';
import { EVENT_INITIAL_ATTEMPTS } from '../constants/event-log';
import type {
  CreateEventInput,
  EventLogRecord,
  EventLogRepository,
} from './event-log.repository';

function toRecord(model: EventLog): EventLogRecord {
  return {
    id: model.id,
    source: model.source,
    direction: model.direction,
    type: model.type,
    status: model.status,
    aggregateType: model.aggregateType,
    aggregateId: model.aggregateId,
    reference: model.reference,
    idempotencyKey: model.idempotencyKey,
    payload: model.payload,
    response: model.response,
    httpStatus: model.httpStatus,
    errorMessage: model.errorMessage,
    attempts: model.attempts,
    createdAt: model.createdAt,
    processedAt: model.processedAt,
    updatedAt: model.updatedAt,
  };
}

@Injectable()
export class PrismaEventLogRepository implements EventLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateEventInput): Promise<EventLogRecord> {
    const model = await this.prisma.eventLog.create({
      data: {
        source: input.source,
        direction: input.direction,
        type: input.type,
        status: 'RECEIVED',
        attempts: EVENT_INITIAL_ATTEMPTS,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        reference: input.reference,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload as Prisma.InputJsonValue | undefined,
      },
    });
    return toRecord(model);
  }

  async markProcessing(id: string): Promise<void> {
    await this.prisma.eventLog.update({
      where: { id },
      data: { status: 'PROCESSING' },
    });
  }

  async markProcessed(id: string, result: MarkProcessedInput): Promise<void> {
    const data: Prisma.EventLogUpdateInput = {
      status: 'PROCESSED',
      processedAt: new Date(),
    };
    if (result.response !== undefined) {
      data.response = result.response as Prisma.InputJsonValue;
    }
    if (result.httpStatus !== undefined) {
      data.httpStatus = result.httpStatus;
    }
    await this.prisma.eventLog.update({ where: { id }, data });
  }

  async markFailed(id: string, result: MarkFailedInput): Promise<void> {
    await this.prisma.eventLog.update({
      where: { id },
      data: {
        status: 'FAILED',
        processedAt: new Date(),
        errorMessage: result.errorMessage,
      },
    });
  }

  async findStaleForRecovery(params: {
    olderThan: Date;
    limit: number;
  }): Promise<EventLogRecord[]> {
    const models = await this.prisma.eventLog.findMany({
      where: {
        status: { in: ['RECEIVED', 'PROCESSING'] },
        createdAt: { lt: params.olderThan },
      },
      orderBy: { createdAt: 'asc' },
      take: params.limit,
    });
    return models.map(toRecord);
  }
}
