/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { PrismaEventLogRepository } from '../repository/event-log.prisma-repository';
import type { PrismaService } from '../../../prisma/prisma.service';

describe('PrismaEventLogRepository', () => {
  let repo: PrismaEventLogRepository;
  let model: {
    create: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
  };

  const now = new Date('2026-10-17T00:00:00Z');
  const row = {
    id: 'ev1',
    source: 'JOKUL',
    direction: 'INBOUND',
    type: 'VA_CALLBACK_RECEIVED',
    status: 'RECEIVED',
    aggregateType: 'Order',
    aggregateId: 'o1',
    reference: 'ext1',
    idempotencyKey: null,
    payload: null,
    response: null,
    httpStatus: null,
    errorMessage: null,
    attempts: 1,
    createdAt: now,
    processedAt: null,
    updatedAt: now,
  };

  beforeEach(() => {
    model = { create: jest.fn(), update: jest.fn(), findMany: jest.fn() };
    repo = new PrismaEventLogRepository({
      eventLog: model,
    } as unknown as PrismaService);
  });

  it('creates an event with RECEIVED status and attempts = 1', async () => {
    model.create.mockResolvedValue(row);

    const result = await repo.create({
      source: 'JOKUL',
      direction: 'INBOUND',
      type: 'VA_CALLBACK_RECEIVED',
      aggregateType: 'Order',
      aggregateId: 'o1',
    });

    const data = model.create.mock.calls[0][0].data;
    expect(data.status).toBe('RECEIVED');
    expect(data.attempts).toBe(1);
    expect(data.aggregateId).toBe('o1');
    expect(result).toEqual({
      id: 'ev1',
      source: 'JOKUL',
      direction: 'INBOUND',
      type: 'VA_CALLBACK_RECEIVED',
      status: 'RECEIVED',
      aggregateType: 'Order',
      aggregateId: 'o1',
      reference: 'ext1',
      idempotencyKey: null,
      payload: null,
      response: null,
      httpStatus: null,
      errorMessage: null,
      attempts: 1,
      createdAt: now,
      processedAt: null,
      updatedAt: now,
    });
  });

  it('marks PROCESSING', async () => {
    model.update.mockResolvedValue(row);

    await repo.markProcessing('ev1');

    expect(model.update).toHaveBeenCalledWith({
      where: { id: 'ev1' },
      data: { status: 'PROCESSING' },
    });
  });

  it('marks PROCESSED with processedAt and optional response/status', async () => {
    model.update.mockResolvedValue(row);

    await repo.markProcessed('ev1', {
      response: { ok: true },
      httpStatus: 200,
    });

    const data = model.update.mock.calls[0][0].data;
    expect(data.status).toBe('PROCESSED');
    expect(data.processedAt).toBeInstanceOf(Date);
    expect(data.response).toEqual({ ok: true });
    expect(data.httpStatus).toBe(200);
  });

  it('does not set response when omitted', async () => {
    model.update.mockResolvedValue(row);

    await repo.markProcessed('ev1', { httpStatus: 200 });

    const data = model.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('response');
  });

  it('marks FAILED with processedAt and error', async () => {
    model.update.mockResolvedValue(row);

    await repo.markFailed('ev1', { errorMessage: 'boom' });

    const data = model.update.mock.calls[0][0].data;
    expect(data.status).toBe('FAILED');
    expect(data.processedAt).toBeInstanceOf(Date);
    expect(data.errorMessage).toBe('boom');
  });

  it('finds stale events by status and age', async () => {
    model.findMany.mockResolvedValue([row]);
    const olderThan = new Date('2026-10-16T00:00:00Z');

    const result = await repo.findStaleForRecovery({ olderThan, limit: 25 });

    expect(model.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['RECEIVED', 'PROCESSING'] },
        createdAt: { lt: olderThan },
      },
      orderBy: { createdAt: 'asc' },
      take: 25,
    });
    expect(result).toHaveLength(1);
  });
});
