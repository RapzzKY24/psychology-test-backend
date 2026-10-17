import { PaymentsService } from '../service/payments.service';
import { GDC_ACK } from '../constants/payments';
import type { EventLogService } from '../../event-log/service/event-log.service';
import type { IdempotencyService } from '../../idempotency/service/idempotency.service';
import type { OrdersService } from '../../orders/service/orders.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let orders: jest.Mocked<
    Pick<OrdersService, 'findByVaNumber' | 'confirmExternalPayment'>
  >;
  let eventLog: jest.Mocked<
    Pick<EventLogService, 'record' | 'markProcessed' | 'markFailed'>
  >;
  let idempotency: jest.Mocked<
    Pick<IdempotencyService, 'begin' | 'complete' | 'fail'>
  >;

  const order = { id: 'o1', amount: 200000 };

  const callback = {
    partnerServiceId: '   GDC',
    customerNo: '12345',
    virtualAccountNo: '19008172',
    virtualAccountName: 'DISC',
    trxId: 'o1',
    paymentRequestId: 'pr1',
    sourceBankCode: '014',
    paidAmount: { value: '200000.00', currency: 'IDR' },
    totalAmount: { value: '200000.00', currency: 'IDR' },
    trxDateTime: '2026-10-17T06:00:00+07:00',
    referenceNo: 'ref-1',
    additionalInfo: {
      paymentDate: '2026-10-17T06:00:00+07:00',
      paymentMethod: 'TRANSFER',
      transactionType: 'C',
      latestTransactionStatus: '00',
      transactionStatusDesc: 'Success',
    },
  };

  beforeEach(() => {
    orders = { findByVaNumber: jest.fn(), confirmExternalPayment: jest.fn() };
    eventLog = {
      record: jest.fn(),
      markProcessed: jest.fn(),
      markFailed: jest.fn(),
    };
    idempotency = { begin: jest.fn(), complete: jest.fn(), fail: jest.fn() };

    eventLog.record.mockResolvedValue({ id: 'ev1' } as never);
    eventLog.markProcessed.mockResolvedValue(undefined);
    eventLog.markFailed.mockResolvedValue(undefined);
    idempotency.complete.mockResolvedValue(undefined);
    idempotency.fail.mockResolvedValue(undefined);

    service = new PaymentsService(
      orders as never,
      eventLog as never,
      idempotency as never,
    );
  });

  it('settles a paid callback and acknowledges', async () => {
    idempotency.begin.mockResolvedValue({ acquired: true, id: 'idem1' });
    orders.findByVaNumber.mockResolvedValue(order as never);
    orders.confirmExternalPayment.mockResolvedValue({
      outcome: 'verified',
      wasLate: false,
      sessionId: 's1',
      attemptId: 'a1',
    });

    const ack = await service.handleVaCallback(callback);

    expect(ack).toEqual(GDC_ACK);
    expect(idempotency.begin).toHaveBeenCalledWith({
      scope: 'gdc.va.callback',
      key: 'gdc.va.callback:19008172:ref-1',
    });
    expect(orders.confirmExternalPayment).toHaveBeenCalledWith('o1');
    expect(eventLog.markProcessed).toHaveBeenCalled();
    expect(idempotency.complete).toHaveBeenCalledWith('idem1', {
      responseStatus: 200,
      responseBody: GDC_ACK,
    });
  });

  it('short-circuits a duplicate delivery', async () => {
    idempotency.begin.mockResolvedValue({
      acquired: false,
      existing: { id: 'idem1', status: 'COMPLETED' } as never,
    });

    const ack = await service.handleVaCallback(callback);

    expect(ack).toEqual(GDC_ACK);
    expect(eventLog.record).not.toHaveBeenCalled();
    expect(orders.confirmExternalPayment).not.toHaveBeenCalled();
  });

  it('records and rejects an unknown VA', async () => {
    idempotency.begin.mockResolvedValue({ acquired: true, id: 'idem1' });
    orders.findByVaNumber.mockResolvedValue(null);

    const ack = await service.handleVaCallback(callback);

    expect(ack).toEqual(GDC_ACK);
    expect(eventLog.markFailed).toHaveBeenCalledWith('ev1', {
      errorMessage: 'order_not_found',
    });
    expect(idempotency.fail).toHaveBeenCalledWith('idem1', {
      errorMessage: 'order_not_found',
    });
    expect(orders.confirmExternalPayment).not.toHaveBeenCalled();
  });

  it('rejects an amount mismatch without settling', async () => {
    idempotency.begin.mockResolvedValue({ acquired: true, id: 'idem1' });
    orders.findByVaNumber.mockResolvedValue(order as never);

    const ack = await service.handleVaCallback({
      ...callback,
      totalAmount: { value: '199999.00', currency: 'IDR' },
    });

    expect(ack).toEqual(GDC_ACK);
    expect(idempotency.fail).toHaveBeenCalledWith('idem1', {
      errorMessage: 'amount_mismatch',
    });
    expect(orders.confirmExternalPayment).not.toHaveBeenCalled();
  });

  it('ignores a non-paid status transition', async () => {
    idempotency.begin.mockResolvedValue({ acquired: true, id: 'idem1' });
    orders.findByVaNumber.mockResolvedValue(order as never);

    const ack = await service.handleVaCallback({
      ...callback,
      additionalInfo: {
        ...callback.additionalInfo,
        latestTransactionStatus: '03',
      },
    });

    expect(ack).toEqual(GDC_ACK);
    expect(orders.confirmExternalPayment).not.toHaveBeenCalled();
    expect(eventLog.markProcessed).toHaveBeenCalled();
    expect(idempotency.complete).toHaveBeenCalled();
  });
});
