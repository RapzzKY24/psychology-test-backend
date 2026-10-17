import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { IdempotencyKey, Prisma } from '../../../generated/prisma/client';
import type {
  CreateIdempotencyInput,
  IdempotencyRecord,
  IdempotencyRepository,
} from './idempotency.repository';

function toRecord(model: IdempotencyKey): IdempotencyRecord {
  return {
    id: model.id,
    key: model.key,
    scope: model.scope,
    requestHash: model.requestHash,
    status: model.status,
    responseStatus: model.responseStatus,
    responseBody: model.responseBody,
    lockedAt: model.lockedAt,
    expiresAt: model.expiresAt,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}

@Injectable()
export class PrismaIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateIdempotencyInput): Promise<IdempotencyRecord> {
    const model = await this.prisma.idempotencyKey.create({
      data: {
        key: input.key,
        scope: input.scope,
        requestHash: input.requestHash,
        expiresAt: input.expiresAt,
        lockedAt: new Date(),
        status: 'IN_PROGRESS',
      },
    });
    return toRecord(model);
  }

  async findByKey(key: string): Promise<IdempotencyRecord | null> {
    const model = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });
    return model ? toRecord(model) : null;
  }

  async complete(
    id: string,
    result: { responseStatus: number; responseBody?: unknown },
  ): Promise<void> {
    const data: Prisma.IdempotencyKeyUpdateInput = {
      status: 'COMPLETED',
      responseStatus: result.responseStatus,
    };
    if (result.responseBody !== undefined) {
      data.responseBody = result.responseBody as Prisma.InputJsonValue;
    }
    await this.prisma.idempotencyKey.update({ where: { id }, data });
  }

  async fail(id: string): Promise<void> {
    await this.prisma.idempotencyKey.update({
      where: { id },
      data: { status: 'FAILED' },
    });
  }
}
