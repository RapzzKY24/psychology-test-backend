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
      | 'reconcilePendingVas'
      | 'recoverStaleInvoiceProvisioning'
      | 'reconcileUnsettledInvoiceVas'
    >
  >;
  let config: { get: jest.Mock };

  beforeEach(() => {
    payments = {
      recoverStaleCallbacks: jest.fn().mockResolvedValue(0),
      recoverStaleProvisioning: jest
        .fn()
        .mockResolvedValue({ checked: 0, provisioned: 0 }),
      reconcilePendingVas: jest
        .fn()
        .mockResolvedValue({ checked: 0, settled: 0 }),
      recoverStaleInvoiceProvisioning: jest
        .fn()
        .mockResolvedValue({ checked: 0, provisioned: 0 }),
      reconcileUnsettledInvoiceVas: jest
        .fn()
        .mockResolvedValue({ checked: 0, settled: 0 }),
    };
    config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const map: Record<string, unknown> = {
          'app.paymentProvider': 'gdc',
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

  afterEach(() => service.onModuleDestroy());

  it('does not schedule when the gateway provider is inactive', () => {
    config.get.mockImplementation((key: string, fallback?: unknown) =>
      key === 'app.paymentProvider' ? 'manual' : fallback,
    );
    service.onModuleInit();
    expect(
      (service as unknown as { timer?: NodeJS.Timeout }).timer,
    ).toBeUndefined();
  });

  it('runs both recovery passes', async () => {
    await service.runOnce();
    expect(payments.recoverStaleCallbacks).toHaveBeenCalled();
    expect(payments.recoverStaleProvisioning).toHaveBeenCalled();
    expect(payments.reconcilePendingVas).toHaveBeenCalled();
  });

  it('skips a pass while one is already running and swallows errors', async () => {
    let release: () => void = () => undefined;
    payments.recoverStaleCallbacks.mockImplementation(
      () => new Promise<number>((resolve) => (release = () => resolve(0))),
    );

    const first = service.runOnce();
    await service.runOnce();
    expect(payments.reconcilePendingVas).not.toHaveBeenCalled();
    release();
    await first;

    payments.recoverStaleCallbacks.mockRejectedValue(new Error('boom'));
    await expect(service.runOnce()).resolves.toBeUndefined();
  });
});
