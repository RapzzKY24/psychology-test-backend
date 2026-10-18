import { BadGatewayException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { InvoiceVaService } from '../service/invoice-va.service';
import type { InvoicesRepository } from '../repository/invoices.repository';
import type { IdempotencyService } from '../../idempotency/service/idempotency.service';
import { GdcApiError } from '../../gdc/errors/gdc-api.error';
import { StubVaProvider } from '../gateway/stub-va.provider';

describe('InvoiceVaService', () => {
  let service: InvoiceVaService;
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
  let gateway: { createVa: jest.Mock; inquiryVa: jest.Mock };
  let config: { get: jest.Mock };

  const invoice = {
    id: 'inv1',
    amount: 300000,
    expiresAt: new Date('2026-09-01T02:00:00Z'),
    vaNumber: null,
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
      createVa: jest.fn().mockResolvedValue({
        vaNumber: '8801234',
        bankCode: '014',
        trxId: 'inv1',
        referenceNo: null,
      }),
      inquiryVa: jest.fn(),
    };
    config = { get: jest.fn().mockReturnValue(true) };
    service = new InvoiceVaService(
      repo as unknown as InvoicesRepository,
      idempotency as unknown as IdempotencyService,
      eventLog as never,
      gateway,
      config as unknown as ConfigService,
    );
  });

  describe('isEnabled', () => {
    it('is true when GDC_STUB is on', () => {
      config.get.mockReturnValue(true);
      expect(service.isEnabled()).toBe(true);
    });

    it('is true when the payment provider is gdc', () => {
      config.get.mockImplementation((key: string) =>
        key === 'app.gdcStub' ? false : 'gdc',
      );
      expect(service.isEnabled()).toBe(true);
    });

    it('is false when neither stub nor gdc is configured', () => {
      config.get.mockImplementation((key: string) =>
        key === 'app.gdcStub' ? false : 'manual',
      );
      expect(service.isEnabled()).toBe(false);
    });
  });

  it('provisions a VA, records the event, and persists the columns', async () => {
    await service.provision('inv1', 'Sesi Rekrutmen');

    expect(gateway.createVa).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: 'inv1', amount: 300000 }),
    );
    const vaResult = {
      vaNumber: '8801234',
      bankCode: '014',
      trxId: 'inv1',
      referenceNo: null,
    };
    expect(idempotency.complete).toHaveBeenCalledWith('c1', {
      responseStatus: 200,
      responseBody: vaResult,
    });
    expect(eventLog.markProcessed).toHaveBeenCalledWith('e1', {
      response: vaResult,
    });
    expect(repo.update).toHaveBeenCalledWith(
      'inv1',
      expect.objectContaining({
        vaNumber: '8801234',
        vaBankCode: '014',
        gdcExternalId: 'inv1',
        paymentProvider: 'GDC_VA',
      }),
    );
  });

  it('is idempotent: an already-provisioned invoice issues no second VA', async () => {
    repo.findById.mockResolvedValue({ ...invoice, vaNumber: '889999' });

    await service.provision('inv1', 'Sesi');

    expect(gateway.createVa).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('reuses the cached result on a completed duplicate', async () => {
    idempotency.begin.mockResolvedValue({
      acquired: false,
      existing: {
        id: 'c1',
        status: 'COMPLETED',
        responseBody: {
          vaNumber: '881111',
          bankCode: '014',
          trxId: 'inv1',
          referenceNo: null,
        },
      },
    });

    await service.provision('inv1', 'Sesi');

    expect(gateway.createVa).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith(
      'inv1',
      expect.objectContaining({ vaNumber: '881111' }),
    );
  });

  it('on a gateway failure marks the event and claim failed, updates nothing', async () => {
    gateway.createVa.mockRejectedValue(
      new GdcApiError('request_failed', 'boom', 500, '/va'),
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

  describe('reprovision', () => {
    it('issues a fresh, amount-scoped VA for a still-UNPAID invoice', async () => {
      repo.findById.mockResolvedValue({
        ...invoice,
        status: 'UNPAID',
        vaNumber: '889999',
        amount: 150000,
      });

      await service.reprovision('inv1', 'Sesi');

      expect(gateway.createVa).toHaveBeenCalledWith(
        expect.objectContaining({ externalId: 'inv1:150000', amount: 150000 }),
      );
      expect(repo.update).toHaveBeenCalledWith(
        'inv1',
        expect.objectContaining({ gdcExternalId: 'inv1:150000' }),
      );
    });

    it('does nothing once the invoice is no longer UNPAID', async () => {
      repo.findById.mockResolvedValue({ ...invoice, status: 'PAID' });

      await service.reprovision('inv1', 'Sesi');

      expect(gateway.createVa).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});

describe('StubVaProvider', () => {
  it('returns a deterministic VA with no network call', async () => {
    const provider = new StubVaProvider();
    const first = await provider.createVa({
      externalId: 'inv-abc',
      amount: 300000,
      name: 'Sesi',
      expiresAt: new Date(),
    });
    const second = await provider.createVa({
      externalId: 'inv-abc',
      amount: 300000,
      name: 'Sesi',
      expiresAt: new Date(),
    });

    expect(first.vaNumber).toMatch(/^88\d+$/);
    expect(first.vaNumber).toBe(second.vaNumber);
    expect(first.bankCode).toBe('014');
  });
});
