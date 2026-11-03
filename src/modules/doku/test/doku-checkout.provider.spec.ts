import type { ConfigService } from '@nestjs/config';
import { DokuCheckoutProvider } from '../gateway/doku-checkout.provider';
import { DokuApiError } from '../errors/doku-api.error';
import type { DokuClient, DokuCreatePaymentInput } from '../client/doku.client';
import type {
  DokuCreatePaymentResponse,
  DokuStatusResponse,
} from '../dto/doku.dto';

const EXTERNAL_ID = '6f1c9b0e-0000-4000-8000-000000000001';

function config(resultUrlBase?: string): ConfigService {
  return {
    get: jest.fn((key: string) =>
      key === 'app.doku.resultUrlBase' ? resultUrlBase : undefined,
    ),
  } as unknown as ConfigService;
}

function setup(resultUrlBase?: string) {
  const client = {
    createPayment: jest.fn<
      Promise<DokuCreatePaymentResponse>,
      [DokuCreatePaymentInput]
    >(),
    getStatus: jest.fn<Promise<DokuStatusResponse>, [string]>(),
    isConfigured: jest.fn(),
  };
  const provider = new DokuCheckoutProvider(
    client as unknown as DokuClient,
    config(resultUrlBase),
  );
  return { provider, client };
}

describe('DokuCheckoutProvider.createPayment', () => {
  it('returns the hosted url and no token', async () => {
    const { provider, client } = setup('https://app.test/pembayaran');
    client.createPayment.mockResolvedValue({
      response: { payment: { url: 'https://pay.doku.test/abc' } },
    });

    const result = await provider.createPayment({
      externalId: EXTERNAL_ID,
      amount: 200000,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      customer: { name: 'Budi', email: 'budi@test.local' },
    });

    expect(result).toEqual({
      providerOrderId: EXTERNAL_ID,
      token: '',
      redirectUrl: 'https://pay.doku.test/abc',
      transactionId: '',
    });

    const input = client.createPayment.mock.calls[0][0];
    // Doku takes a duration, not a deadline.
    expect(input.dueMinutes).toBe(30);
    expect(input.customer).toEqual({ name: 'Budi', email: 'budi@test.local' });
    expect(input.callbackUrl).toBe(
      `https://app.test/pembayaran/${EXTERNAL_ID}`,
    );
    expect(input.callbackUrlResult).toBe(
      `https://app.test/pembayaran/${EXTERNAL_ID}`,
    );
  });

  it('never asks for a due date in the past', async () => {
    const { provider, client } = setup();
    client.createPayment.mockResolvedValue({
      response: { payment: { url: 'https://pay.doku.test/abc' } },
    });

    await provider.createPayment({
      externalId: EXTERNAL_ID,
      amount: 1,
      expiresAt: new Date(Date.now() - 60_000),
    });

    expect(client.createPayment.mock.calls[0][0].dueMinutes).toBe(1);
  });

  it('omits the callbacks when no result base is configured', async () => {
    const { provider, client } = setup();
    client.createPayment.mockResolvedValue({
      response: { payment: { url: 'https://pay.doku.test/abc' } },
    });

    await provider.createPayment({
      externalId: EXTERNAL_ID,
      amount: 1,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const input = client.createPayment.mock.calls[0][0];
    expect(input.callbackUrl).toBeUndefined();
    expect(input.callbackUrlResult).toBeUndefined();
  });
});

describe('DokuCheckoutProvider.getStatus', () => {
  it('maps a settlement and keeps the amount for the reconcile guard', async () => {
    const { provider, client } = setup();
    client.getStatus.mockResolvedValue({
      order: { amount: '200000.00' },
      transaction: { status: 'SUCCESS' },
    });

    await expect(
      provider.getStatus({ providerOrderId: EXTERNAL_ID }),
    ).resolves.toEqual({
      providerOrderId: EXTERNAL_ID,
      status: 'PAID',
      paidAmount: 200000,
      paymentType: null,
    });
  });

  it('reports no amount rather than zero when Doku omits it', async () => {
    const { provider, client } = setup();
    client.getStatus.mockResolvedValue({
      transaction: { status: 'SUCCESS' },
    });

    const status = await provider.getStatus({ providerOrderId: EXTERNAL_ID });

    // A settlement without a provable amount must not settle: the reconcile
    // guard compares this value with the stored order amount.
    expect(status.paidAmount).toBeNull();
  });

  it('reads a 404 as "no transaction yet" instead of an outage', async () => {
    const { provider, client } = setup();
    client.getStatus.mockRejectedValue(
      new DokuApiError('http_error', 'not found', 404),
    );

    await expect(
      provider.getStatus({ providerOrderId: EXTERNAL_ID }),
    ).resolves.toMatchObject({ status: 'PENDING', paidAmount: null });
  });

  it('rethrows anything that is not a 404', async () => {
    const { provider, client } = setup();
    client.getStatus.mockRejectedValue(
      new DokuApiError('http_error', 'boom', 500),
    );

    await expect(
      provider.getStatus({ providerOrderId: EXTERNAL_ID }),
    ).rejects.toBeInstanceOf(DokuApiError);
  });
});
