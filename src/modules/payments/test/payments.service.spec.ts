import { BadGatewayException } from '@nestjs/common';
import { PaymentsService } from '../service/payments.service';
import { MIDTRANS_ACK } from '../constants/payments';
import { MidtransApiError } from '../../midtrans/errors/midtrans-api.error';
import type { EventLogService } from '../../event-log/service/event-log.service';
import type { IdempotencyService } from '../../idempotency/service/idempotency.service';
import type { OrdersService } from '../../orders/service/orders.service';
import type { InvoicesService } from '../../invoices/service/invoices.service';
import type { InvoicePaymentService } from '../../invoices/service/invoice-payment.service';
import type { OrderPaymentService } from '../../orders/service/order-payment.service';
import type { ConfigService } from '@nestjs/config';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let orders: jest.Mocked<
    Pick<
      OrdersService,
      | 'findByProviderOrderId'
      | 'updatePaymentType'
      | 'cancel'
      | 'confirmExternalPayment'
      | 'findUnsettledOrders'
      | 'findPendingOrdersWithoutProviderOrderId'
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
      | 'findByProviderOrderId'
      | 'updatePaymentType'
      | 'confirmPaymentWithActivation'
      | 'findUnpaidWithoutProviderOrderId'
      | 'findUnsettledInvoices'
    >
  >;
  let invoicePayment: jest.Mocked<
    Pick<InvoicePaymentService, 'isEnabled' | 'provision' | 'getStatus'>
  >;
  let orderPayment: jest.Mocked<Pick<OrderPaymentService, 'getStatus'>>;
  let config: { get: jest.Mock };

  beforeEach(() => {
    orders = {
      findByProviderOrderId: jest.fn().mockResolvedValue(null),
      updatePaymentType: jest.fn(),
      cancel: jest.fn(),
      confirmExternalPayment: jest.fn(),
      findUnsettledOrders: jest.fn(),
      findPendingOrdersWithoutProviderOrderId: jest.fn(),
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
      findByProviderOrderId: jest.fn().mockResolvedValue(null),
      updatePaymentType: jest.fn(),
      confirmPaymentWithActivation: jest.fn(),
      findUnpaidWithoutProviderOrderId: jest.fn().mockResolvedValue([]),
      findUnsettledInvoices: jest.fn().mockResolvedValue([]),
    };
    invoicePayment = {
      isEnabled: jest.fn().mockReturnValue(true),
      provision: jest.fn(),
      getStatus: jest.fn(),
    };
    orderPayment = { getStatus: jest.fn() };
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
      invoicePayment as never,
      orderPayment as never,
      eventLog as never,
      idempotency as never,
      config as unknown as ConfigService,
    );
  });

  describe('recoverStaleProvisioning', () => {
    it('reprovisions a gateway order that never got a payment', async () => {
      orders.findPendingOrdersWithoutProviderOrderId.mockResolvedValue([
        { id: 'o1' } as never,
      ]);
      orders.reprovision.mockResolvedValue({
        id: 'o1',
        providerOrderId: 'o1',
      } as never);

      const result = await service.recoverStaleProvisioning();

      expect(result).toEqual({ checked: 1, provisioned: 1 });
      expect(orders.reprovision).toHaveBeenCalledWith('o1');
      expect(
        orders.findPendingOrdersWithoutProviderOrderId,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'MIDTRANS_SNAP' }),
      );
    });

    it('continues when a reprovision attempt fails', async () => {
      orders.findPendingOrdersWithoutProviderOrderId.mockResolvedValue([
        { id: 'o1' } as never,
      ]);
      orders.reprovision.mockRejectedValue(
        new MidtransApiError('request_failed', 'boom', 500, '/p'),
      );

      const result = await service.recoverStaleProvisioning();

      expect(result).toEqual({ checked: 1, provisioned: 0 });
    });
  });

  describe('recoverStaleCallbacks', () => {
    it('replays a stale Midtrans notification and settles it', async () => {
      // Stored without `signature_key`: it is verified at ingress, never kept.
      eventLog.findStaleForRecovery.mockResolvedValue([
        {
          id: 'ev9',
          type: 'PAYMENT_NOTIFICATION_RECEIVED',
          payload: {
            order_id: 'o1',
            status_code: '200',
            gross_amount: '200000.00',
            transaction_status: 'settlement',
            transaction_id: 'trx-1',
            payment_type: 'bank_transfer',
            fraud_status: 'accept',
          },
        } as never,
      ]);
      orders.findByProviderOrderId.mockResolvedValue({
        id: 'o1',
        amount: 200000,
        status: 'PENDING',
      } as never);
      orders.confirmExternalPayment.mockResolvedValue({
        outcome: 'verified',
        wasLate: false,
        sessionId: 's1',
        attemptId: 'a1',
      });

      const replayed = await service.recoverStaleCallbacks();

      expect(replayed).toBe(1);
      expect(eventLog.markProcessing).toHaveBeenCalledWith('ev9');
      expect(orders.confirmExternalPayment).toHaveBeenCalledWith(
        'o1',
        'MIDTRANS',
      );
      expect(eventLog.markProcessed).toHaveBeenCalledWith(
        'ev9',
        expect.anything(),
      );
    });
  });

  describe('reconcilePendingPayments', () => {
    const vaOrder = {
      id: 'o1',
      amount: 200000,
      vaNumber: '19008172',
      providerOrderId: 'o1',
    };

    it('unlocks an order the provider reports as paid', async () => {
      orders.findUnsettledOrders.mockResolvedValue([vaOrder] as never);
      orderPayment.getStatus.mockResolvedValue({
        providerOrderId: 'o1',
        status: 'PAID',
        paidAmount: 200000,
        paymentType: null,
      });
      orders.confirmExternalPayment.mockResolvedValue({
        outcome: 'verified',
        wasLate: true,
        sessionId: 's1',
        attemptId: 'a1',
      });

      const result = await service.reconcilePendingPayments();

      expect(result).toEqual({ checked: 1, settled: 1 });
      expect(orders.confirmExternalPayment).toHaveBeenCalledWith(
        'o1',
        'MIDTRANS',
      );
    });

    it('settles a Snap order that has no VA number, using its provider order id', async () => {
      config.get.mockImplementation((key: string, fallback?: unknown) => {
        const map: Record<string, unknown> = {
          'app.paymentProvider': 'midtrans',
          'app.recovery.lookbackMin': 1440,
          'app.recovery.batchSize': 50,
        };
        return map[key] ?? fallback;
      });
      orders.findUnsettledOrders.mockResolvedValue([
        { id: 'o1', amount: 200000, vaNumber: null, providerOrderId: 'o1' },
      ] as never);
      orderPayment.getStatus.mockResolvedValue({
        providerOrderId: 'o1',
        status: 'PAID',
        paidAmount: 200000,
        paymentType: 'bank_transfer',
      });
      orders.confirmExternalPayment.mockResolvedValue({
        outcome: 'verified',
        wasLate: true,
        sessionId: 's1',
        attemptId: 'a1',
      });

      const result = await service.reconcilePendingPayments();

      expect(orderPayment.getStatus).toHaveBeenCalledWith({
        providerOrderId: 'o1',
      });
      expect(result).toEqual({ checked: 1, settled: 1 });
      expect(orders.confirmExternalPayment).toHaveBeenCalledWith(
        'o1',
        'MIDTRANS',
      );
      expect(orders.updatePaymentType).toHaveBeenCalledWith(
        'o1',
        'bank_transfer',
      );
    });

    it('skips orders the provider still reports as unpaid', async () => {
      orders.findUnsettledOrders.mockResolvedValue([vaOrder] as never);
      orderPayment.getStatus.mockResolvedValue({
        providerOrderId: 'o1',
        status: 'PENDING',
        paidAmount: null,
        paymentType: null,
      });

      const result = await service.reconcilePendingPayments();

      expect(result).toEqual({ checked: 1, settled: 0 });
      expect(orders.confirmExternalPayment).not.toHaveBeenCalled();
    });

    it('continues when the gateway call fails', async () => {
      orders.findUnsettledOrders.mockResolvedValue([vaOrder] as never);
      orderPayment.getStatus.mockRejectedValue(
        new MidtransApiError('request_failed', 'boom', 500, '/p'),
      );

      const result = await service.reconcilePendingPayments();

      expect(result).toEqual({ checked: 1, settled: 0 });
    });
  });

  describe('recoverStaleInvoiceProvisioning', () => {
    it('skips entirely when no VA gateway is enabled', async () => {
      invoicePayment.isEnabled.mockReturnValue(false);

      const result = await service.recoverStaleInvoiceProvisioning();

      expect(result).toEqual({ checked: 0, provisioned: 0 });
      expect(invoices.findUnpaidWithoutProviderOrderId).not.toHaveBeenCalled();
    });

    it('retries provisioning for an UNPAID invoice with no VA', async () => {
      invoices.findUnpaidWithoutProviderOrderId.mockResolvedValue([
        { id: 'inv1', number: 'INV-1' } as never,
      ]);
      invoicePayment.provision.mockResolvedValue({
        providerOrderId: 'inv1',
        vaNumber: '8801',
      } as never);

      const result = await service.recoverStaleInvoiceProvisioning();

      expect(result).toEqual({ checked: 1, provisioned: 1 });
      expect(invoicePayment.provision).toHaveBeenCalledWith('inv1', 'INV-1');
    });

    it('continues when a provisioning retry fails', async () => {
      invoices.findUnpaidWithoutProviderOrderId.mockResolvedValue([
        { id: 'inv1', number: 'INV-1' } as never,
      ]);
      invoicePayment.provision.mockRejectedValue(
        new BadGatewayException('boom'),
      );

      const result = await service.recoverStaleInvoiceProvisioning();

      expect(result).toEqual({ checked: 1, provisioned: 0 });
    });
  });

  describe('reconcileUnsettledInvoicePayments', () => {
    const vaInvoice = {
      id: 'inv1',
      amount: 200000,
      vaNumber: '8801',
      providerOrderId: 'inv1',
    };

    it('activates an invoice the provider reports as paid', async () => {
      invoices.findUnsettledInvoices.mockResolvedValue([vaInvoice] as never);
      invoicePayment.getStatus.mockResolvedValue({
        providerOrderId: 'inv1',
        status: 'PAID',
        paidAmount: 200000,
        paymentType: null,
      });
      invoices.confirmPaymentWithActivation.mockResolvedValue({
        outcome: 'confirmed',
        invoice: vaInvoice as never,
      });

      const result = await service.reconcileUnsettledInvoicePayments();

      expect(result).toEqual({ checked: 1, settled: 1 });
      expect(invoices.confirmPaymentWithActivation).toHaveBeenCalledWith(
        'inv1',
        expect.objectContaining({
          paidAmount: 200000,
          verifiedBySource: 'MIDTRANS',
        }),
      );
    });

    it('attributes a Midtrans settlement to MIDTRANS', async () => {
      config.get.mockImplementation((key: string, fallback?: unknown) => {
        const map: Record<string, unknown> = {
          'app.paymentProvider': 'midtrans',
          'app.recovery.lookbackMin': 1440,
          'app.recovery.batchSize': 50,
        };
        return map[key] ?? fallback;
      });
      invoices.findUnsettledInvoices.mockResolvedValue([vaInvoice] as never);
      invoicePayment.getStatus.mockResolvedValue({
        providerOrderId: 'inv1',
        status: 'PAID',
        paidAmount: 200000,
        paymentType: 'qris',
      });
      invoices.confirmPaymentWithActivation.mockResolvedValue({
        outcome: 'confirmed',
        invoice: vaInvoice as never,
      });

      await service.reconcileUnsettledInvoicePayments();

      expect(invoices.confirmPaymentWithActivation).toHaveBeenCalledWith(
        'inv1',
        expect.objectContaining({ verifiedBySource: 'MIDTRANS' }),
      );
      expect(invoices.updatePaymentType).toHaveBeenCalledWith('inv1', 'qris');
    });

    it('skips an invoice the provider still reports as unpaid', async () => {
      invoices.findUnsettledInvoices.mockResolvedValue([vaInvoice] as never);
      invoicePayment.getStatus.mockResolvedValue({
        providerOrderId: 'inv1',
        status: 'PENDING',
        paidAmount: null,
        paymentType: null,
      });

      const result = await service.reconcileUnsettledInvoicePayments();

      expect(result).toEqual({ checked: 1, settled: 0 });
      expect(invoices.confirmPaymentWithActivation).not.toHaveBeenCalled();
    });
  });

  describe('handleNotification', () => {
    /** Aliases over the service mocks, so each case reads as a lookup + write. */
    interface RepositorySeam {
      findByProviderOrderId: jest.Mock;
      update: jest.Mock;
    }

    /** Realistic Snap notification body; each case overrides one field. */
    const notification = {
      order_id: 'o1',
      status_code: '200',
      gross_amount: '200000.00',
      signature_key: 'x',
      transaction_status: 'settlement',
      transaction_id: 'trx-1',
      payment_type: 'bank_transfer',
      fraud_status: 'accept',
    };

    let orderRepo: RepositorySeam;
    let invoiceRepo: RepositorySeam;
    let cancelOrder: jest.Mock;

    const pendingOrder = { id: 'o1', amount: 200000, status: 'PENDING' };
    const unpaidInvoice = {
      id: 'inv1',
      amount: 300000,
      sessionId: 's1',
      status: 'UNPAID',
    };

    beforeEach(() => {
      orders.findByProviderOrderId.mockResolvedValue(null);
      invoices.findByProviderOrderId.mockResolvedValue(null);
      cancelOrder = orders.cancel as unknown as jest.Mock;
      cancelOrder.mockResolvedValue({ orderId: 'o1', status: 'CANCELLED' });

      orderRepo = {
        findByProviderOrderId:
          orders.findByProviderOrderId as unknown as jest.Mock,
        update: orders.updatePaymentType as unknown as jest.Mock,
      };
      invoiceRepo = {
        findByProviderOrderId:
          invoices.findByProviderOrderId as unknown as jest.Mock,
        update: invoices.updatePaymentType as unknown as jest.Mock,
      };

      idempotency.begin.mockResolvedValue({ acquired: true, id: 'idem1' });
    });

    afterEach(() => {
      // Pure webhook handling: no gateway/client call may happen here.
      expect(orderPayment.getStatus).not.toHaveBeenCalled();
      expect(invoicePayment.getStatus).not.toHaveBeenCalled();
      expect(invoicePayment.provision).not.toHaveBeenCalled();
    });

    it('settles a PENDING order on settlement and acknowledges', async () => {
      orderRepo.findByProviderOrderId.mockResolvedValue(pendingOrder);
      orders.confirmExternalPayment.mockResolvedValue({
        outcome: 'verified',
        wasLate: false,
        sessionId: 's1',
        attemptId: 'a1',
      });

      const ack = await service.handleNotification(notification);

      expect(ack).toEqual(MIDTRANS_ACK);
      expect(idempotency.begin).toHaveBeenCalledWith({
        scope: 'midtrans.notification',
        key: 'o1:settlement:200',
      });
      expect(orders.confirmExternalPayment).toHaveBeenCalledWith(
        'o1',
        'MIDTRANS',
      );
      expect(eventLog.markProcessed).toHaveBeenCalledWith('ev1', {
        response: { orderId: 'o1', sessionId: 's1', wasLate: false },
      });
      expect(idempotency.complete).toHaveBeenCalledWith('idem1', {
        responseStatus: 200,
        responseBody: MIDTRANS_ACK,
      });
      expect(eventLog.markFailed).not.toHaveBeenCalled();
    });

    it('short-circuits a duplicate delivery', async () => {
      idempotency.begin.mockResolvedValue({
        acquired: false,
        existing: { id: 'idem1', status: 'COMPLETED' } as never,
      });

      const ack = await service.handleNotification(notification);

      expect(ack).toEqual(MIDTRANS_ACK);
      expect(orders.confirmExternalPayment).not.toHaveBeenCalled();
      expect(eventLog.record).not.toHaveBeenCalled();
      expect(idempotency.complete).not.toHaveBeenCalled();
    });

    it('rejects a settlement whose gross_amount does not match the order', async () => {
      orderRepo.findByProviderOrderId.mockResolvedValue(pendingOrder);

      const ack = await service.handleNotification({
        ...notification,
        gross_amount: '199999.00',
      });

      expect(ack).toEqual(MIDTRANS_ACK);
      expect(orders.confirmExternalPayment).not.toHaveBeenCalled();
      expect(eventLog.markFailed).toHaveBeenCalledWith('ev1', {
        errorMessage: 'amount_mismatch',
      });
      expect(idempotency.fail).toHaveBeenCalledWith('idem1', {
        errorMessage: 'amount_mismatch',
      });
      expect(idempotency.complete).not.toHaveBeenCalled();
    });

    it('never slides a PAID order back to pending', async () => {
      orderRepo.findByProviderOrderId.mockResolvedValue({
        id: 'o1',
        amount: 200000,
        status: 'PAID',
      });

      const ack = await service.handleNotification({
        ...notification,
        transaction_status: 'pending',
        status_code: '201',
      });

      expect(ack).toEqual(MIDTRANS_ACK);
      expect(orderRepo.update).not.toHaveBeenCalled();
      expect(orders.confirmExternalPayment).not.toHaveBeenCalled();
      expect(eventLog.markProcessed).toHaveBeenCalledWith('ev1', {
        response: { ignored: 'already_paid', incoming: 'pending' },
      });
      expect(eventLog.markFailed).not.toHaveBeenCalled();
    });

    it('records an unknown order_id and still acknowledges', async () => {
      orderRepo.findByProviderOrderId.mockResolvedValue(null);
      invoiceRepo.findByProviderOrderId.mockResolvedValue(null);

      const ack = await service.handleNotification(notification);

      expect(ack).toEqual(MIDTRANS_ACK);
      expect(eventLog.markFailed).toHaveBeenCalledWith('ev1', {
        errorMessage: 'payment_not_found',
      });
      expect(idempotency.fail).toHaveBeenCalledWith('idem1', {
        errorMessage: 'payment_not_found',
      });
      expect(orders.confirmExternalPayment).not.toHaveBeenCalled();
      expect(invoices.confirmPaymentWithActivation).not.toHaveBeenCalled();
    });

    it('records an expired order without settling or cancelling it', async () => {
      orderRepo.findByProviderOrderId.mockResolvedValue(pendingOrder);

      const ack = await service.handleNotification({
        ...notification,
        transaction_status: 'expire',
      });

      expect(ack).toEqual(MIDTRANS_ACK);
      expect(orders.confirmExternalPayment).not.toHaveBeenCalled();
      expect(cancelOrder).not.toHaveBeenCalled();
      expect(eventLog.markProcessed).toHaveBeenCalledWith('ev1', {
        response: { expired: true, orderId: 'o1' },
      });
      expect(eventLog.markFailed).not.toHaveBeenCalled();
    });

    it('keeps a denied payment retryable: no cancel, no settle', async () => {
      orderRepo.findByProviderOrderId.mockResolvedValue(pendingOrder);

      const ack = await service.handleNotification({
        ...notification,
        transaction_status: 'deny',
        status_code: '202',
      });

      expect(ack).toEqual(MIDTRANS_ACK);
      expect(cancelOrder).not.toHaveBeenCalled();
      expect(orders.confirmExternalPayment).not.toHaveBeenCalled();
      expect(eventLog.markProcessed).toHaveBeenCalledWith('ev1', {
        response: { ignored: 'deny' },
      });
      expect(idempotency.complete).toHaveBeenCalled();
    });

    it('settles an UNPAID invoice and activates its session', async () => {
      invoiceRepo.findByProviderOrderId.mockResolvedValue(unpaidInvoice);
      invoices.confirmPaymentWithActivation.mockResolvedValue({
        outcome: 'confirmed',
        invoice: unpaidInvoice as never,
      });

      const ack = await service.handleNotification({
        ...notification,
        order_id: 'inv1',
        gross_amount: '300000.00',
      });

      expect(ack).toEqual(MIDTRANS_ACK);
      expect(invoices.confirmPaymentWithActivation).toHaveBeenCalledWith(
        'inv1',
        { paidAmount: 300000, verifiedBySource: 'MIDTRANS' },
      );
      expect(eventLog.markProcessed).toHaveBeenCalledWith('ev1', {
        response: { invoiceId: 'inv1', sessionId: 's1' },
      });
      expect(idempotency.complete).toHaveBeenCalled();
    });

    it('activates an already-PAID invoice only once', async () => {
      invoiceRepo.findByProviderOrderId.mockResolvedValue({
        ...unpaidInvoice,
        status: 'PAID',
      });
      invoices.confirmPaymentWithActivation.mockResolvedValue({
        outcome: 'already_paid',
        invoice: unpaidInvoice as never,
      });

      const ack = await service.handleNotification({
        ...notification,
        order_id: 'inv1',
        gross_amount: '300000.00',
      });

      expect(ack).toEqual(MIDTRANS_ACK);
      expect(invoices.confirmPaymentWithActivation).toHaveBeenCalledTimes(1);
      expect(eventLog.markProcessed).toHaveBeenCalledWith('ev1', {
        response: { alreadySettled: true, invoiceId: 'inv1' },
      });
      expect(eventLog.markFailed).not.toHaveBeenCalled();
    });

    it('acks an unparsable body without throwing', async () => {
      await expect(
        service.handleNotification({ unexpected: true }),
      ).resolves.toEqual(MIDTRANS_ACK);

      expect(eventLog.record).toHaveBeenCalled();
      expect(eventLog.markFailed).toHaveBeenCalledWith('ev1', {
        errorMessage: 'unparsable_payload',
      });
      expect(idempotency.begin).not.toHaveBeenCalled();
      expect(orders.confirmExternalPayment).not.toHaveBeenCalled();
    });
  });
});
