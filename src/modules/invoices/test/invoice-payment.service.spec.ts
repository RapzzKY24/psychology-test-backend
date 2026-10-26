import { BadGatewayException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { InvoicePaymentService } from '../service/invoice-payment.service';
import type { InvoicesRepository } from '../repository/invoices.repository';
import type { IdempotencyService } from '../../idempotency/service/idempotency.service';
import { JokulApiError } from '../../jokul/errors/jokul-api.error';
import { StubVaProvider } from '../../jokul/gateway/stub-va.provider';

describe('InvoicePaymentService', () => {
  let service: InvoicePaymentService;
  let repo: {
    findById: jest.Mock;
    update: jest.Mock;
  };
  let idempotency: {
    begin: jest.Mock;
    complete: jest.Mock;
    fail: jest.Mock;
  };
  let eventLog: {
    record: jest.Mock;
    markProcessed: jest.Mock;
    markFailed: jest.Mock;
  };
  let gateway: { createPayment: jest.Mock; getStatus: jest.Mock };
  let config: { get: jest.Mock };

  const invoice = {
    id: 'inv1',
    amount: 300000,
    expiresAt: new Date('2026-09-01T02:00:00Z'),
    vaNumber: null,
  };

  const paymentResult = {
    providerOrderId: 'inv1',
    token: '',
    redirectUrl: '',
    transactionId: 'inv1',
    vaNumber: '8801234',
    bankCode: '014',
  };

  beforeEach(() => {
    repo = {
      findById: jest.fn().mockResolvedValue(invoice),
      update: jest.fn(),
    };
    idempotency = {
      begin: jest.fn().mockResolvedValue({ acquired: true, id: 'c1' }),
      complete: jest.fn(),
      fail: jest.fn(),
    };
    eventLog = {
      record: jest.fn().mockResolvedValue({ id: 'e1' }),
      markProcessed: jest.fn(),
      markFailed: jest.fn(),
    };
    gateway = {
      createPayment: jest.fn().mockResolvedValue(paymentResult),
      getStatus: jest.fn(),
    };
    config = { get: jest.fn().mockReturnValue(true) };
    service = new InvoicePaymentService(
      repo as unknown as InvoicesRepository,
      idempotency as unknown as IdempotencyService,
      eventLog as never,
      gateway,
      config as unknown as ConfigService,
    );
  });

  describe('isEnabled', () => {
    it('is true when the dev stub is on and a gateway provider is selected', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'app.jokul.stub') return true;
        if (key === 'app.paymentProvider') return 'jokul';
        return undefined;
      });
      expect(service.isEnabled()).toBe(true);
    });

    it('is true when the payment provider is jokul', () => {
      config.get.mockImplementation((key: string) =>
        key === 'app.jokul.stub' ? false : 'jokul',
      );
      expect(service.isEnabled()).toBe(true);
    });

    it('is false when the provider is manual', () => {
      config.get.mockImplementation((key: string) =>
        key === 'app.jokul.stub' ? false : 'manual',
      );
      expect(service.isEnabled()).toBe(false);
    });
  });

  it('provisions a payment, records the event, and persists the columns', async () => {
    await service.provision('inv1', 'Sesi Rekrutmen');

    expect(gateway.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: 'inv1', amount: 300000 }),
    );
    expect(idempotency.begin).toHaveBeenCalledWith({
      scope: 'jokul.invoice.payment.create',
      key: 'inv1',
    });
    expect(idempotency.complete).toHaveBeenCalledWith('c1', {
      responseStatus: 200,
      responseBody: paymentResult,
    });
    expect(eventLog.markProcessed).toHaveBeenCalledWith('e1', {
      response: paymentResult,
    });
    expect(repo.update).toHaveBeenCalledWith(
      'inv1',
      expect.objectContaining({
        vaNumber: '8801234',
        vaBankCode: '014',
        paymentProvider: 'JOKUL_VA',
      }),
    );
  });

  it('is idempotent: an already-provisioned invoice issues no second VA', async () => {
    repo.findById.mockResolvedValue({ ...invoice, vaNumber: '889999' });

    await service.provision('inv1', 'Sesi');

    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('reuses the cached result on a completed duplicate', async () => {
    idempotency.begin.mockResolvedValue({
      acquired: false,
      existing: {
        id: 'c1',
        status: 'COMPLETED',
        responseBody: {
          ...paymentResult,
          vaNumber: '881111',
        },
      },
    });

    await service.provision('inv1', 'Sesi');

    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith(
      'inv1',
      expect.objectContaining({ vaNumber: '881111' }),
    );
  });

  it('on a gateway failure marks the event and claim failed, updates nothing', async () => {
    gateway.createPayment.mockRejectedValue(
      new JokulApiError('request_failed', 'boom', 500, '/va'),
    );

    await expect(service.provision('inv1', 'Sesi')).rejects.toThrow(
      BadGatewayException,
    );
    expect(eventLog.markFailed).toHaveBeenCalledWith('e1', {
      errorMessage: 'boom',
    });
    expect(idempotency.fail).toHaveBeenCalledWith('c1', {
      errorMessage: 'boom',
    });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('delegates status polling to the gateway seam', async () => {
    gateway.getStatus.mockResolvedValue({
      providerOrderId: 'inv1',
      status: 'PAID',
      paidAmount: 300000,
      paymentType: 'qris',
    });

    const result = await service.getStatus({
      providerOrderId: 'inv1',
      vaNumber: '8801234',
    });

    expect(gateway.getStatus).toHaveBeenCalledWith({
      providerOrderId: 'inv1',
      vaNumber: '8801234',
    });
    expect(result).toEqual({
      providerOrderId: 'inv1',
      status: 'PAID',
      paidAmount: 300000,
      paymentType: 'qris',
    });
  });

  describe('reprovision', () => {
    it('issues a fresh, amount-scoped VA for a still-UNPAID invoice', async () => {
      repo.findById.mockResolvedValue({
        ...invoice,
        status: 'UNPAID',
        vaNumber: '889999',
        amount: 150000,
      });

      await service.reprovision('inv1', 'Sesi');

      expect(gateway.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ externalId: 'inv1-150000', amount: 150000 }),
      );
      expect(idempotency.begin).toHaveBeenCalledWith({
        scope: 'jokul.invoice.payment.reprovision',
        key: 'inv1-150000',
      });
      expect(repo.update).toHaveBeenCalledWith(
        'inv1',
        expect.objectContaining({}),
      );
    });

    it('does nothing once the invoice is no longer UNPAID', async () => {
      repo.findById.mockResolvedValue({ ...invoice, status: 'PAID' });

      await service.reprovision('inv1', 'Sesi');

      expect(gateway.createPayment).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});

describe('StubVaProvider', () => {
  it('returns a deterministic VA with no network call', async () => {
    const provider = new StubVaProvider();
    const params = {
      externalId: 'inv-abc',
      amount: 300000,
      expiresAt: new Date(),
      customer: { name: 'Sesi' },
    };
    const first = await provider.createPayment(params);
    const second = await provider.createPayment(params);

    expect(first.vaNumber).toMatch(/^88\d+$/);
    expect(first.vaNumber).toBe(second.vaNumber);
    expect(first.bankCode).toBe('JOKUL');
  });
});
