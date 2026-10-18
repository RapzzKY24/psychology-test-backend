import { BadGatewayException } from '@nestjs/common';
import { PaymentsService } from '../service/payments.service';
import { GDC_ACK } from '../constants/payments';
import { GdcApiError } from '../../gdc/errors/gdc-api.error';
import type { EventLogService } from '../../event-log/service/event-log.service';
import type { IdempotencyService } from '../../idempotency/service/idempotency.service';
import type { OrdersService } from '../../orders/service/orders.service';
import type { InvoicesService } from '../../invoices/service/invoices.service';
import type { InvoiceVaService } from '../../invoices/service/invoice-va.service';
import type { OrderVaService } from '../../orders/service/order-va.service';
import type { ConfigService } from '@nestjs/config';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let orders: jest.Mocked<
    Pick<
      OrdersService,
      | 'findByVaNumber'
      | 'confirmExternalPayment'
      | 'findUnsettledVaOrders'
      | 'findPendingVaOrdersWithoutNumber'
      | 'reprovision'
    >
  >;
  let eventLog: jest.Mocked<
    Pick<
      EventLogService,
      | 'record'
      | 'markProcessed'
      | 'markFailed'
      | 'markProcessing'
      | 'findStaleForRecovery'
    >
  >;
  let idempotency: jest.Mocked<
    Pick<IdempotencyService, 'begin' | 'complete' | 'fail'>
  >;
  let invoices: jest.Mocked<
    Pick<
      InvoicesService,
      | 'findByVaNumber'
      | 'confirmPaymentWithActivation'
      | 'findUnpaidWithoutVa'
      | 'findUnsettledVaInvoices'
    >
  >;
  let invoiceVa: jest.Mocked<
    Pick<InvoiceVaService, 'isEnabled' | 'provision' | 'inquiryVa'>
  >;
  let orderVa: jest.Mocked<Pick<OrderVaService, 'inquiryVa'>>;
  let config: { get: jest.Mock };

  const order = { id: 'o1', amount: 200000 };
  const invoice = { id: 'inv1', amount: 300000, sessionId: 's1' };

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
    orders = {
      findByVaNumber: jest.fn(),
      confirmExternalPayment: jest.fn(),
      findUnsettledVaOrders: jest.fn(),
      findPendingVaOrdersWithoutNumber: jest.fn(),
      reprovision: jest.fn(),
    };
    eventLog = {
      record: jest.fn(),
      markProcessed: jest.fn(),
      markFailed: jest.fn(),
      markProcessing: jest.fn(),
      findStaleForRecovery: jest.fn(),
    };
    idempotency = { begin: jest.fn(), complete: jest.fn(), fail: jest.fn() };
    invoices = {
      findByVaNumber: jest.fn().mockResolvedValue(null),
      confirmPaymentWithActivation: jest.fn(),
      findUnpaidWithoutVa: jest.fn().mockResolvedValue([]),
      findUnsettledVaInvoices: jest.fn().mockResolvedValue([]),
    };
    invoiceVa = {
      isEnabled: jest.fn().mockReturnValue(true),
      provision: jest.fn(),
      inquiryVa: jest.fn(),
    };
    orderVa = { inquiryVa: jest.fn() };
    config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const map: Record<string, unknown> = {
          'app.recovery.staleAfterMin': 5,
          'app.recovery.lookbackMin': 1440,
          'app.recovery.batchSize': 50,
        };
        return map[key] ?? fallback;
      }),
    };

    eventLog.record.mockResolvedValue({ id: 'ev1' } as never);
    eventLog.markProcessed.mockResolvedValue(undefined);
    eventLog.markFailed.mockResolvedValue(undefined);
    eventLog.markProcessing.mockResolvedValue(undefined);
    idempotency.complete.mockResolvedValue(undefined);
    idempotency.fail.mockResolvedValue(undefined);

    service = new PaymentsService(
      orders as never,
      invoices as never,
      invoiceVa as never,
      orderVa as never,
      eventLog as never,
      idempotency as never,
      config as unknown as ConfigService,
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
      errorMessage: 'payment_not_found',
    });
    expect(idempotency.fail).toHaveBeenCalledWith('idem1', {
      errorMessage: 'payment_not_found',
    });
    expect(orders.confirmExternalPayment).not.toHaveBeenCalled();
  });

  it('settles a paid session invoice and activates its session', async () => {
    idempotency.begin.mockResolvedValue({ acquired: true, id: 'idem1' });
    orders.findByVaNumber.mockResolvedValue(null);
    invoices.findByVaNumber.mockResolvedValue(invoice as never);
    invoices.confirmPaymentWithActivation.mockResolvedValue({
      outcome: 'confirmed',
      invoice: invoice as never,
    });

    const ack = await service.handleVaCallback({
      ...callback,
      totalAmount: { value: '300000.00', currency: 'IDR' },
    });

    expect(ack).toEqual(GDC_ACK);
    expect(invoices.confirmPaymentWithActivation).toHaveBeenCalledWith('inv1', {
      paidAmount: 300000,
      verifiedBySource: 'GDC',
      gdcTrxId: 'o1',
      gdcReferenceNo: 'ref-1',
    });
    expect(eventLog.markProcessed).toHaveBeenCalledWith('ev1', {
      response: { invoiceId: 'inv1', sessionId: 's1' },
    });
    expect(idempotency.complete).toHaveBeenCalled();
  });

  it('treats a duplicate invoice callback as already settled', async () => {
    idempotency.begin.mockResolvedValue({ acquired: true, id: 'idem1' });
    orders.findByVaNumber.mockResolvedValue(null);
    invoices.findByVaNumber.mockResolvedValue(invoice as never);
    invoices.confirmPaymentWithActivation.mockResolvedValue({
      outcome: 'already_paid',
      invoice: invoice as never,
    });

    await service.handleVaCallback({
      ...callback,
      totalAmount: { value: '300000.00', currency: 'IDR' },
    });

    expect(eventLog.markProcessed).toHaveBeenCalledWith('ev1', {
      response: { alreadySettled: true, invoiceId: 'inv1' },
    });
    expect(eventLog.markFailed).not.toHaveBeenCalled();
  });

  it('rejects a paid invoice callback whose amount is wrong', async () => {
    idempotency.begin.mockResolvedValue({ acquired: true, id: 'idem1' });
    orders.findByVaNumber.mockResolvedValue(null);
    invoices.findByVaNumber.mockResolvedValue(invoice as never);
    invoices.confirmPaymentWithActivation.mockResolvedValue({
      outcome: 'amount_mismatch',
    });

    await service.handleVaCallback({
      ...callback,
      totalAmount: { value: '299999.00', currency: 'IDR' },
    });

    expect(eventLog.markFailed).toHaveBeenCalledWith('ev1', {
      errorMessage: 'settle_amount_mismatch',
    });
    expect(idempotency.fail).toHaveBeenCalled();
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

  it('still acks and records a failed event when the body is unparsable', async () => {
    eventLog.record.mockResolvedValue({ id: 'ev1' } as never);

    const ack = await service.handleVaCallback({ unexpected: true });

    expect(ack).toEqual(GDC_ACK);
    expect(idempotency.begin).not.toHaveBeenCalled();
    expect(orders.confirmExternalPayment).not.toHaveBeenCalled();
    expect(eventLog.markFailed).toHaveBeenCalledWith('ev1', {
      errorMessage: 'unparsable_payload',
    });
  });

  describe('recoverStaleProvisioning', () => {
    it('reprovisions a gateway order that never got a VA', async () => {
      orders.findPendingVaOrdersWithoutNumber.mockResolvedValue([
        { id: 'o1' } as never,
      ]);
      orders.reprovision.mockResolvedValue({
        id: 'o1',
        vaNumber: '19008172',
      } as never);

      const result = await service.recoverStaleProvisioning();

      expect(result).toEqual({ checked: 1, provisioned: 1 });
      expect(orders.reprovision).toHaveBeenCalledWith('o1');
    });

    it('continues when a reprovision attempt fails', async () => {
      orders.findPendingVaOrdersWithoutNumber.mockResolvedValue([
        { id: 'o1' } as never,
      ]);
      orders.reprovision.mockRejectedValue(
        new GdcApiError('request_failed', 'boom', 500, '/p'),
      );

      const result = await service.recoverStaleProvisioning();

      expect(result).toEqual({ checked: 1, provisioned: 0 });
    });
  });

  it('treats an already-settled order as processed, not failed', async () => {
    idempotency.begin.mockResolvedValue({ acquired: true, id: 'idem1' });
    orders.findByVaNumber.mockResolvedValue(order as never);
    orders.confirmExternalPayment.mockResolvedValue({
      outcome: 'conflict',
      reason: 'already_verified',
    });

    await service.handleVaCallback(callback);

    expect(eventLog.markProcessed).toHaveBeenCalled();
    expect(eventLog.markFailed).not.toHaveBeenCalled();
    expect(idempotency.complete).toHaveBeenCalled();
  });

  describe('recoverStaleCallbacks', () => {
    it('replays stale VA callbacks and settles them', async () => {
      eventLog.findStaleForRecovery.mockResolvedValue([
        {
          id: 'ev9',
          type: 'VA_CALLBACK_RECEIVED',
          payload: callback,
        } as never,
      ]);
      orders.findByVaNumber.mockResolvedValue(order as never);
      orders.confirmExternalPayment.mockResolvedValue({
        outcome: 'verified',
        wasLate: true,
        sessionId: 's1',
        attemptId: 'a1',
      });

      const replayed = await service.recoverStaleCallbacks();

      expect(replayed).toBe(1);
      expect(eventLog.markProcessing).toHaveBeenCalledWith('ev9');
      expect(orders.confirmExternalPayment).toHaveBeenCalledWith('o1');
      expect(eventLog.markProcessed).toHaveBeenCalledWith(
        'ev9',
        expect.anything(),
      );
    });

    it('marks an unparsable stale payload as failed', async () => {
      eventLog.findStaleForRecovery.mockResolvedValue([
        {
          id: 'ev9',
          type: 'VA_CALLBACK_RECEIVED',
          payload: { bad: true },
        } as never,
      ]);

      const replayed = await service.recoverStaleCallbacks();

      expect(replayed).toBe(0);
      expect(eventLog.markFailed).toHaveBeenCalledWith('ev9', {
        errorMessage: 'unparsable_payload',
      });
    });
  });

  describe('reconcilePendingVas', () => {
    const vaOrder = { id: 'o1', amount: 200000, vaNumber: '19008172' };

    it('unlocks an order GDC reports as paid', async () => {
      orders.findUnsettledVaOrders.mockResolvedValue([vaOrder] as never);
      orderVa.inquiryVa.mockResolvedValue({
        vaNumber: '19008172',
        status: '00',
        paidAmount: 200000,
      });
      orders.confirmExternalPayment.mockResolvedValue({
        outcome: 'verified',
        wasLate: true,
        sessionId: 's1',
        attemptId: 'a1',
      });

      const result = await service.reconcilePendingVas();

      expect(result).toEqual({ checked: 1, settled: 1 });
      expect(orders.confirmExternalPayment).toHaveBeenCalledWith('o1');
    });

    it('skips orders GDC still reports as unpaid', async () => {
      orders.findUnsettledVaOrders.mockResolvedValue([vaOrder] as never);
      orderVa.inquiryVa.mockResolvedValue({
        vaNumber: '19008172',
        status: '03',
        paidAmount: null,
      });

      const result = await service.reconcilePendingVas();

      expect(result).toEqual({ checked: 1, settled: 0 });
      expect(orders.confirmExternalPayment).not.toHaveBeenCalled();
    });

    it('continues when the gateway call fails', async () => {
      orders.findUnsettledVaOrders.mockResolvedValue([vaOrder] as never);
      orderVa.inquiryVa.mockRejectedValue(
        new GdcApiError('request_failed', 'boom', 500, '/p'),
      );

      const result = await service.reconcilePendingVas();

      expect(result).toEqual({ checked: 1, settled: 0 });
    });
  });

  describe('recoverStaleInvoiceProvisioning', () => {
    it('skips entirely when no VA gateway is enabled', async () => {
      invoiceVa.isEnabled.mockReturnValue(false);

      const result = await service.recoverStaleInvoiceProvisioning();

      expect(result).toEqual({ checked: 0, provisioned: 0 });
      expect(invoices.findUnpaidWithoutVa).not.toHaveBeenCalled();
    });

    it('retries provisioning for an UNPAID invoice with no VA', async () => {
      invoices.findUnpaidWithoutVa.mockResolvedValue([
        { id: 'inv1', number: 'INV-1' } as never,
      ]);
      invoiceVa.provision.mockResolvedValue({ vaNumber: '8801' } as never);

      const result = await service.recoverStaleInvoiceProvisioning();

      expect(result).toEqual({ checked: 1, provisioned: 1 });
      expect(invoiceVa.provision).toHaveBeenCalledWith('inv1', 'INV-1');
    });

    it('continues when a provisioning retry fails', async () => {
      invoices.findUnpaidWithoutVa.mockResolvedValue([
        { id: 'inv1', number: 'INV-1' } as never,
      ]);
      invoiceVa.provision.mockRejectedValue(new BadGatewayException('boom'));

      const result = await service.recoverStaleInvoiceProvisioning();

      expect(result).toEqual({ checked: 1, provisioned: 0 });
    });
  });

  describe('reconcileUnsettledInvoiceVas', () => {
    const vaInvoice = {
      id: 'inv1',
      amount: 200000,
      vaNumber: '8801',
      gdcTrxId: 'inv1',
      gdcExternalId: 'inv1',
      gdcReferenceNo: null,
    };

    it('activates an invoice GDC reports as paid', async () => {
      invoices.findUnsettledVaInvoices.mockResolvedValue([vaInvoice] as never);
      invoiceVa.inquiryVa.mockResolvedValue({
        vaNumber: '8801',
        status: '00',
        paidAmount: 200000,
      });
      invoices.confirmPaymentWithActivation.mockResolvedValue({
        outcome: 'confirmed',
        invoice: vaInvoice as never,
      });

      const result = await service.reconcileUnsettledInvoiceVas();

      expect(result).toEqual({ checked: 1, settled: 1 });
      expect(invoices.confirmPaymentWithActivation).toHaveBeenCalledWith(
        'inv1',
        expect.objectContaining({ paidAmount: 200000 }),
      );
    });

    it('skips an invoice GDC still reports as unpaid', async () => {
      invoices.findUnsettledVaInvoices.mockResolvedValue([vaInvoice] as never);
      invoiceVa.inquiryVa.mockResolvedValue({
        vaNumber: '8801',
        status: '03',
        paidAmount: null,
      });

      const result = await service.reconcileUnsettledInvoiceVas();

      expect(result).toEqual({ checked: 1, settled: 0 });
      expect(invoices.confirmPaymentWithActivation).not.toHaveBeenCalled();
    });
  });
});
