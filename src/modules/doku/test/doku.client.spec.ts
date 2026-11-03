import type { ConfigService } from '@nestjs/config';
import { DokuClient } from '../client/doku.client';
import { DokuApiError } from '../errors/doku-api.error';

function config(settings: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: unknown) =>
      key in settings ? settings[key] : fallback,
    ),
  } as unknown as ConfigService;
}

const SANDBOX = {
  'app.doku.clientId': 'BRN-1',
  'app.doku.secretKey': 'SK-1',
  'app.doku.isProduction': false,
};

const fetchMock = jest.fn<Promise<unknown>, [string, RequestInit]>();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function ok(body: unknown): unknown {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

function fail(status: number): unknown {
  return {
    ok: false,
    status,
    text: () => Promise.resolve('nope'),
  };
}

describe('DokuClient.createPayment', () => {
  it('posts a signed request to the sandbox checkout endpoint', async () => {
    fetchMock.mockResolvedValue(
      ok({ response: { payment: { url: 'https://pay.doku.test/1' } } }),
    );
    const client = new DokuClient(config(SANDBOX));

    const result = await client.createPayment({
      invoiceNumber: 'INV-1',
      amount: 200000,
      dueMinutes: 30,
      customer: { name: 'Budi', email: 'budi@test.local' },
      callbackUrl: 'https://app.test/pembayaran/INV-1',
      callbackUrlResult: 'https://app.test/pembayaran/INV-1',
    });

    expect(result.response.payment.url).toBe('https://pay.doku.test/1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api-sandbox.doku.com/checkout/v1/payment');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers['Client-Id']).toBe('BRN-1');
    expect(headers.Signature.startsWith('HMACSHA256=')).toBe(true);
    // Doku rejects a timestamp with milliseconds.
    expect(headers['Request-Timestamp']).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
    );

    const body = JSON.parse(init.body as string) as {
      order: Record<string, unknown>;
      payment: Record<string, unknown>;
      customer: Record<string, unknown>;
    };
    expect(body.order).toMatchObject({
      invoice_number: 'INV-1',
      amount: 200000,
      currency: 'IDR',
      auto_redirect: true,
    });
    expect(body.payment).toEqual({ payment_due_date: 30 });
    expect(body.customer).toEqual({
      name: 'Budi',
      email: 'budi@test.local',
    });
  });

  it('uses the production host when configured for production', async () => {
    fetchMock.mockResolvedValue(
      ok({ response: { payment: { url: 'https://pay.doku.test/1' } } }),
    );
    const client = new DokuClient(
      config({ ...SANDBOX, 'app.doku.isProduction': true }),
    );

    await client.createPayment({
      invoiceNumber: 'INV-1',
      amount: 1,
      dueMinutes: 1,
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.doku.com/checkout/v1/payment',
    );
  });

  it('throws a gateway error carrying the HTTP status', async () => {
    fetchMock.mockResolvedValue(fail(400));
    const client = new DokuClient(config(SANDBOX));

    await expect(
      client.createPayment({
        invoiceNumber: 'INV-1',
        amount: 1,
        dueMinutes: 1,
      }),
    ).rejects.toMatchObject({ name: 'DokuApiError', status: 400 });
  });

  it('treats an unreadable payload as a transport failure', async () => {
    fetchMock.mockResolvedValue(ok({ unexpected: true }));
    const client = new DokuClient(config(SANDBOX));

    await expect(
      client.createPayment({
        invoiceNumber: 'INV-1',
        amount: 1,
        dueMinutes: 1,
      }),
    ).rejects.toBeInstanceOf(DokuApiError);
  });
});

describe('DokuClient.getStatus', () => {
  it('puts the invoice number in the path and sends no body', async () => {
    fetchMock.mockResolvedValue(ok({ transaction: { status: 'SUCCESS' } }));
    const client = new DokuClient(config(SANDBOX));

    await client.getStatus('INV 1/2');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://api-sandbox.doku.com/orders/v1/status/INV%201%2F2',
    );
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('keeps the 404 status so the caller can read it as "not payable yet"', async () => {
    fetchMock.mockResolvedValue(fail(404));
    const client = new DokuClient(config(SANDBOX));

    await expect(client.getStatus('INV-1')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('DokuClient retries', () => {
  it('retries a connection failure and gives up as a gateway error', async () => {
    const connectionError = Object.assign(new Error('connect'), {
      cause: { code: 'ECONNREFUSED' },
    });
    fetchMock.mockRejectedValue(connectionError);
    const client = new DokuClient(config(SANDBOX));

    await expect(client.getStatus('INV-1')).rejects.toMatchObject({
      name: 'DokuApiError',
      code: 'connection_failed',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 10_000);

  it('does not retry a timeout raised after the request was sent', async () => {
    fetchMock.mockRejectedValue(new Error('The operation was aborted'));
    const client = new DokuClient(config(SANDBOX));

    await expect(client.getStatus('INV-1')).rejects.toBeInstanceOf(
      DokuApiError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
