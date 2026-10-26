import { PaymentsRecoveryService } from '../service/payments-recovery.service';
import type { PaymentsService } from '../service/payments.service';
import type { ConfigService } from '@nestjs/config';

describe('PaymentsRecoveryService', () => {
  let service: PaymentsRecoveryService;
  let payments: jest.Mocked<
    Pick<
      PaymentsService,
      | 'recoverStaleCallbacks'
      | 'recoverStaleProvisioning'
      | 'reconcilePendingPayments'
      | 'recoverStaleInvoiceProvisioning'
      | 'reconcileUnsettledInvoicePayments'
    >
  >;
  let config: { get: jest.Mock };

  beforeEach(() => {
    payments = {
      recoverStaleCallbacks: jest.fn().mockResolvedValue(0),
      recoverStaleProvisioning: jest
        .fn()
        .mockResolvedValue({ checked: 0, provisioned: 0 }),
      reconcilePendingPayments: jest
        .fn()
        .mockResolvedValue({ checked: 0, settled: 0 }),
      recoverStaleInvoiceProvisioning: jest
        .fn()
        .mockResolvedValue({ checked: 0, provisioned: 0 }),
      reconcileUnsettledInvoicePayments: jest
        .fn()
        .mockResolvedValue({ checked: 0, settled: 0 }),
    };
    config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const map: Record<string, unknown> = {
          'app.paymentProvider': 'jokul',
          'app.recovery.intervalMin': 5,
        };
        return map[key] ?? fallback;
      }),
    };
    service = new PaymentsRecoveryService(
      payments as never,
      config as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    service.onModuleDestroy();
  });

  const timerOf = () =>
    (service as unknown as { timer?: NodeJS.Timeout }).timer;

  it('does not schedule when the provider is manual', () => {
    config.get.mockImplementation((key: string, fallback?: unknown) =>
      key === 'app.paymentProvider' ? 'manual' : fallback,
    );

    service.onModuleInit();

    expect(timerOf()).toBeUndefined();
  });

  it.each(['jokul', 'midtrans'])(
    'schedules for the %s provider',
    (provider) => {
      config.get.mockImplementation((key: string, fallback?: unknown) =>
        key === 'app.paymentProvider' ? provider : fallback,
      );

      service.onModuleInit();

      expect(timerOf()).toBeDefined();
    },
  );

  it('runs a catch-up pass shortly after boot', () => {
    jest.useFakeTimers();
    service.onModuleInit();

    jest.advanceTimersByTime(15_000);

    expect(payments.recoverStaleCallbacks).toHaveBeenCalled();
  });

  it('runs every recovery pass', async () => {
    await service.runOnce();

    expect(payments.recoverStaleCallbacks).toHaveBeenCalled();
    expect(payments.recoverStaleProvisioning).toHaveBeenCalled();
    expect(payments.reconcilePendingPayments).toHaveBeenCalled();
    expect(payments.recoverStaleInvoiceProvisioning).toHaveBeenCalled();
    expect(payments.reconcileUnsettledInvoicePayments).toHaveBeenCalled();
  });

  it('skips a pass while one is already running and swallows errors', async () => {
    let release: () => void = () => undefined;
    payments.recoverStaleCallbacks.mockImplementation(
      () => new Promise<number>((resolve) => (release = () => resolve(0))),
    );

    const first = service.runOnce();
    await service.runOnce();
    expect(payments.reconcilePendingPayments).not.toHaveBeenCalled();
    release();
    await first;

    payments.recoverStaleCallbacks.mockRejectedValue(new Error('boom'));
    await expect(service.runOnce()).resolves.toBeUndefined();
  });
});
