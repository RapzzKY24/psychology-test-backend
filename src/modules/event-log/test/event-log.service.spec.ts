/* eslint-disable @typescript-eslint/unbound-method */
import { EventLogService } from '../service/event-log.service';
import type {
  EventLogRecord,
  EventLogRepository,
} from '../repository/event-log.repository';

describe('EventLogService', () => {
  let service: EventLogService;
  let mockRepo: jest.Mocked<EventLogRepository>;

  const record: EventLogRecord = {
    id: 'ev1',
    source: 'GDC',
    direction: 'INBOUND',
    type: 'VA_CALLBACK_RECEIVED',
    status: 'RECEIVED',
    aggregateType: 'Order',
    aggregateId: '11111111-1111-4111-8111-111111111111',
    reference: 'ext1',
    idempotencyKey: 'gdc.va.callback:123:ref1',
    payload: null,
    response: null,
    httpStatus: null,
    errorMessage: null,
    attempts: 1,
    createdAt: new Date(),
    processedAt: null,
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      markProcessing: jest.fn(),
      markProcessed: jest.fn(),
      markFailed: jest.fn(),
      findStaleForRecovery: jest.fn(),
    };
    service = new EventLogService(mockRepo);
  });

  it('records an event (validated) via the repository', async () => {
    mockRepo.create.mockResolvedValue(record);

    const result = await service.record({
      source: 'GDC',
      direction: 'INBOUND',
      type: 'VA_CALLBACK_RECEIVED',
      aggregateType: 'Order',
      aggregateId: '11111111-1111-4111-8111-111111111111',
      payload: { vaNumber: '123' },
    });

    expect(result).toBe(record);
    expect(mockRepo.create).toHaveBeenCalledWith({
      source: 'GDC',
      direction: 'INBOUND',
      type: 'VA_CALLBACK_RECEIVED',
      aggregateType: 'Order',
      aggregateId: '11111111-1111-4111-8111-111111111111',
      payload: { vaNumber: '123' },
    });
  });

  it('rejects an invalid event input', async () => {
    await expect(
      service.record({
        source: 'GDC',
        direction: 'INBOUND',
        type: '',
      }),
    ).rejects.toThrow();
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it('delegates status transitions', async () => {
    mockRepo.markProcessing.mockResolvedValue(undefined);
    mockRepo.markProcessed.mockResolvedValue(undefined);
    mockRepo.markFailed.mockResolvedValue(undefined);

    await service.markProcessing('ev1');
    await service.markProcessed('ev1', { httpStatus: 200 });
    await service.markFailed('ev1', { errorMessage: 'boom' });

    expect(mockRepo.markProcessing).toHaveBeenCalledWith('ev1');
    expect(mockRepo.markProcessed).toHaveBeenCalledWith('ev1', {
      httpStatus: 200,
    });
    expect(mockRepo.markFailed).toHaveBeenCalledWith('ev1', {
      errorMessage: 'boom',
    });
  });

  it('delegates the recovery scan', async () => {
    mockRepo.findStaleForRecovery.mockResolvedValue([record]);
    const olderThan = new Date();

    const result = await service.findStaleForRecovery({ olderThan, limit: 50 });

    expect(result).toEqual([record]);
    expect(mockRepo.findStaleForRecovery).toHaveBeenCalledWith({
      olderThan,
      limit: 50,
    });
  });
});
