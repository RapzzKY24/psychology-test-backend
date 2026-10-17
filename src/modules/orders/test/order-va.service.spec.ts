import { BadGatewayException } from '@nestjs/common';
import { OrderVaService } from '../service/order-va.service';
import { GdcApiError } from '../../gdc/errors/gdc-api.error';
import type { OrdersRepository } from '../repository/orders.repository';
import type { IdempotencyService } from '../../idempotency/service/idempotency.service';
import type { EventLogService } from '../../event-log/service/event-log.service';
import type { GdcClient } from '../../gdc/client/gdc.client';
import type { ConfigService } from '@nestjs/config';

describe('OrderVaService', () => {
  let service: OrderVaService;
  let repo: jest.Mocked<
    Pick<OrdersRepository, 'create' | 'update' | 'findById' | 'findTestById'>
  >;
  let idempotency: jest.Mocked<
    Pick<IdempotencyService, 'begin' | 'complete' | 'fail'>
  >;
  let eventLog: jest.Mocked<Pick<EventLogService, 'record' | 'markProcessed'>>;
  let gdc: jest.Mocked<Pick<GdcClient, 'createVirtualAccount'>>;
  let config: { get: jest.Mock };

  const baseOrder = {
    id: 'o1',
    userId: 'u1',
    testId: 't1',
    basePrice: 200000,
    uniqueCode: 0,
    amount: 200000,
    status: 'PENDING',
    paymentProvider: 'GDC_VA',
    expiresAt: new Date(Date.now() + 3600_000),
  };

  const vaResult = {
    virtualAccountNo: '19008172',
    trxId: 'o1',
    referenceNo: 'ref-1',
  };

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      findTestById: jest.fn(),
    };
    idempotency = { begin: jest.fn(), complete: jest.fn(), fail: jest.fn() };
    eventLog = { record: jest.fn(), markProcessed: jest.fn() };
    gdc = { createVirtualAccount: jest.fn() };
    config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const map: Record<string, unknown> = {
          'app.paymentProvider': 'gdc',
          'app.paymentTtlMin': 60,
          'app.gdc.accountNumber': 'acc',
        };
        return map[key] ?? fallback;
      }),
    };

    service = new OrderVaService(
      repo as never,
      idempotency as never,
      eventLog as never,
      gdc as never,
      config as unknown as ConfigService,
    );
  });

  it('isEnabled reflects the configured provider', () => {
    expect(service.isEnabled()).toBe(true);
    config.get.mockReturnValue('manual');
    expect(service.isEnabled()).toBe(false);
  });

  it('creates a VA order and provisions the virtual account', async () => {
    repo.create.mockResolvedValue(baseOrder as never);
    idempotency.begin.mockResolvedValue({ acquired: true, id: 'idem1' });
    eventLog.record.mockResolvedValue({ id: 'ev1' } as never);
    gdc.createVirtualAccount.mockResolvedValue(vaResult);
    eventLog.markProcessed.mockResolvedValue(undefined);
    idempotency.complete.mockResolvedValue(undefined);
    repo.update.mockResolvedValue({
      ...baseOrder,
      vaNumber: vaResult.virtualAccountNo,
      vaBankCode: '014',
    } as never);

    const order = await service.createVaOrder('t1', 'u1', 200000, 'DISC');

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        basePrice: 200000,
        uniqueCode: 0,
        amount: 200000,
        paymentProvider: 'GDC_VA',
      }),
    );
    expect(gdc.createVirtualAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        virtualAccountName: 'DISC',
        virtualAccountTrxType: 'C',
        bankCode: '014',
        accountNumber: 'acc',
      }),
      'o1',
    );
    expect(idempotency.complete).toHaveBeenCalledWith('idem1', {
      responseStatus: 200,
      responseBody: vaResult,
    });
    expect(repo.update).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({ vaNumber: '19008172', vaBankCode: '014' }),
    );
    expect(order.vaNumber).toBe('19008172');
  });

  it('reuses the stored VA result on a completed duplicate', async () => {
    repo.create.mockResolvedValue(baseOrder as never);
    idempotency.begin.mockResolvedValue({
      acquired: false,
      existing: {
        id: 'idem1',
        status: 'COMPLETED',
        responseBody: vaResult,
      } as never,
    });
    repo.update.mockResolvedValue({
      ...baseOrder,
      vaNumber: vaResult.virtualAccountNo,
    } as never);

    await service.createVaOrder('t1', 'u1', 200000, 'DISC');

    expect(gdc.createVirtualAccount).not.toHaveBeenCalled();
    expect(eventLog.record).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({ vaNumber: '19008172' }),
    );
  });

  it('reprovisions an order that has no VA yet', async () => {
    repo.findById.mockResolvedValue({ ...baseOrder, vaNumber: null } as never);
    repo.findTestById.mockResolvedValue({ name: 'DISC Form A' } as never);
    idempotency.begin.mockResolvedValue({ acquired: true, id: 'idem1' });
    eventLog.record.mockResolvedValue({ id: 'ev1' } as never);
    gdc.createVirtualAccount.mockResolvedValue(vaResult);
    eventLog.markProcessed.mockResolvedValue(undefined);
    idempotency.complete.mockResolvedValue(undefined);
    repo.update.mockResolvedValue({
      ...baseOrder,
      vaNumber: vaResult.virtualAccountNo,
    } as never);

    const order = await service.reprovision('o1');

    expect(gdc.createVirtualAccount).toHaveBeenCalledWith(
      expect.objectContaining({ virtualAccountName: 'DISC Form A' }),
      'o1',
    );
    expect(order?.vaNumber).toBe('19008172');
  });

  it('reprovision is a no-op once a VA exists', async () => {
    repo.findById.mockResolvedValue({
      ...baseOrder,
      vaNumber: '19008172',
    } as never);

    await service.reprovision('o1');

    expect(gdc.createVirtualAccount).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('maps a GDC failure to 502 and leaves the event for recovery', async () => {
    repo.create.mockResolvedValue(baseOrder as never);
    idempotency.begin.mockResolvedValue({ acquired: true, id: 'idem1' });
    eventLog.record.mockResolvedValue({ id: 'ev1' } as never);
    gdc.createVirtualAccount.mockRejectedValue(
      new GdcApiError('request_failed', 'boom', 500, '/p'),
    );
    idempotency.fail.mockResolvedValue(undefined);

    await expect(
      service.createVaOrder('t1', 'u1', 200000, 'DISC'),
    ).rejects.toBeInstanceOf(BadGatewayException);

    expect(idempotency.fail).toHaveBeenCalledWith('idem1', {
      errorMessage: 'boom',
    });
    expect(eventLog.markProcessed).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });
});
