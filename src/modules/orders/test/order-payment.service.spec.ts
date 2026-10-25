import { BadGatewayException } from '@nestjs/common';
import { OrderPaymentService } from '../service/order-payment.service';
import { JokulApiError } from '../../jokul/errors/jokul-api.error';
import type { PaymentGateway } from '../../payments/gateway/payment-gateway.interface';
import type { OrdersRepository } from '../repository/orders.repository';
import type { IdempotencyService } from '../../idempotency/service/idempotency.service';
import type { EventLogService } from '../../event-log/service/event-log.service';
import type { ConfigService } from '@nestjs/config';

describe('OrderPaymentService', () => {
  let service: OrderPaymentService;
  let repo: jest.Mocked<
    Pick<OrdersRepository, 'create' | 'update' | 'findById' | 'findTestById'>
  >;
  let idempotency: jest.Mocked<
    Pick<IdempotencyService, 'begin' | 'complete' | 'fail'>
  >;
  let eventLog: jest.Mocked<Pick<EventLogService, 'record' | 'markProcessed'>>;
  let gateway: jest.Mocked<Pick<PaymentGateway, 'createPayment' | 'getStatus'>>;
  let config: { get: jest.Mock };

  const baseOrder = {
    id: 'o1',
    userId: 'u1',
    testId: 't1',
    basePrice: 200000,
    uniqueCode: 0,
    amount: 200000,
    status: 'PENDING',
    paymentProvider: 'JOKUL_VA',
    expiresAt: new Date(Date.now() + 3600_000),
  };

  const paymentResult = {
    providerOrderId: 'o1',
    token: '',
    redirectUrl: '',
    transactionId: 'o1',
    vaNumber: '19008172',
    bankCode: '014',
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
    gateway = { createPayment: jest.fn(), getStatus: jest.fn() };
    config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const map: Record<string, unknown> = {
          'app.paymentProvider': 'jokul',
          'app.paymentTtlMin': 60,
        };
        return map[key] ?? fallback;
      }),
    };

    service = new OrderPaymentService(
      repo as never,
      idempotency as never,
      eventLog as never,
      gateway,
      config as unknown as ConfigService,
    );
  });

  it('isEnabled reflects the configured provider', () => {
    expect(service.isEnabled()).toBe(true);
    config.get.mockReturnValue('manual');
    expect(service.isEnabled()).toBe(false);
  });

  it('isEnabled is true under the dev stub when a gateway provider is selected', () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'app.jokul.stub') return true;
      if (key === 'app.paymentProvider') return 'jokul';
      return undefined;
    });
    expect(service.isEnabled()).toBe(true);
  });

  it('creates a payment order and provisions the payment', async () => {
    repo.create.mockResolvedValue(baseOrder as never);
    idempotency.begin.mockResolvedValue({ acquired: true, id: 'idem1' });
    eventLog.record.mockResolvedValue({ id: 'ev1' } as never);
    gateway.createPayment.mockResolvedValue(paymentResult);
    eventLog.markProcessed.mockResolvedValue(undefined);
    idempotency.complete.mockResolvedValue(undefined);
    repo.update.mockResolvedValue({
      ...baseOrder,
      vaNumber: paymentResult.vaNumber,
      vaBankCode: paymentResult.bankCode,
    } as never);

    const order = await service.createPaymentOrder('t1', 'u1', 200000, 'DISC');

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        basePrice: 200000,
        uniqueCode: 0,
        amount: 200000,
        paymentProvider: 'JOKUL_VA',
      }),
    );
    expect(gateway.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: 'o1',
        amount: 200000,
        customer: { name: 'DISC' },
      }),
    );
    expect(idempotency.begin).toHaveBeenCalledWith({
      scope: 'jokul.payment.create',
      key: 'o1',
    });
    expect(idempotency.complete).toHaveBeenCalledWith('idem1', {
      responseStatus: 200,
      responseBody: paymentResult,
    });
    expect(repo.update).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({ vaNumber: '19008172', vaBankCode: '014' }),
    );
    expect(order.vaNumber).toBe('19008172');
  });

  it('delegates inquiry to the gateway seam', async () => {
    gateway.getStatus.mockResolvedValue({
      providerOrderId: 'o1',
      status: 'PAID',
      paidAmount: 200000,
      paymentType: null,
    });

    const result = await service.inquiryVa({
      vaNumber: '19008172',
      paymentRequestId: 'trx1',
      externalId: 'o1',
    });

    expect(gateway.getStatus).toHaveBeenCalledWith({
      providerOrderId: 'o1',
      vaNumber: '19008172',
    });
    expect(result.status).toBe('00');
  });

  it('reuses the stored VA result on a completed duplicate', async () => {
    repo.create.mockResolvedValue(baseOrder as never);
    idempotency.begin.mockResolvedValue({
      acquired: false,
      existing: {
        id: 'idem1',
        status: 'COMPLETED',
        responseBody: paymentResult,
      } as never,
    });
    repo.update.mockResolvedValue({
      ...baseOrder,
      vaNumber: paymentResult.vaNumber,
    } as never);

    await service.createPaymentOrder('t1', 'u1', 200000, 'DISC');

    expect(gateway.createPayment).not.toHaveBeenCalled();
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
    gateway.createPayment.mockResolvedValue(paymentResult);
    eventLog.markProcessed.mockResolvedValue(undefined);
    idempotency.complete.mockResolvedValue(undefined);
    repo.update.mockResolvedValue({
      ...baseOrder,
      vaNumber: paymentResult.vaNumber,
    } as never);

    const order = await service.reprovision('o1');

    expect(gateway.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: { name: 'DISC Form A' },
        externalId: 'o1',
      }),
    );
    expect(order?.vaNumber).toBe('19008172');
  });

  it('reprovision is a no-op once a VA exists', async () => {
    repo.findById.mockResolvedValue({
      ...baseOrder,
      vaNumber: '19008172',
    } as never);

    await service.reprovision('o1');

    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('maps a gateway failure to 502 and leaves the event for recovery', async () => {
    repo.create.mockResolvedValue(baseOrder as never);
    idempotency.begin.mockResolvedValue({ acquired: true, id: 'idem1' });
    eventLog.record.mockResolvedValue({ id: 'ev1' } as never);
    gateway.createPayment.mockRejectedValue(
      new JokulApiError('request_failed', 'boom', 500, '/p'),
    );
    idempotency.fail.mockResolvedValue(undefined);

    await expect(
      service.createPaymentOrder('t1', 'u1', 200000, 'DISC'),
    ).rejects.toBeInstanceOf(BadGatewayException);

    expect(idempotency.fail).toHaveBeenCalledWith('idem1', {
      errorMessage: 'boom',
    });
    expect(eventLog.markProcessed).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });
});
