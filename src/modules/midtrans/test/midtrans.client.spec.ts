/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import type { ConfigService } from '@nestjs/config';
import { MidtransClient } from '../client/midtrans.client';
import { MidtransApiError } from '../errors/midtrans-api.error';

const SERVER_KEY = 'SB-Mid-server-TEST-SECRET';
const ORDER_ID = 'INV-2026-0001';

const cfg = {
  stub: false,
  isProduction: false,
  serverKey: SERVER_KEY,
  clientKey: 'SB-Mid-client-test',
  finishUrl: 'https://api.example.com/payments/finish',
};

const config = (): ConfigService =>
  ({ get: jest.fn().mockReturnValue(cfg) }) as unknown as ConfigService;

const jsonResponse = (ok: boolean, status: number, body: unknown) => ({
  ok,
  status,
  json: async () => body,
});

const createInput = () => ({
  providerOrderId: ORDER_ID,
  amount: 200000,
  expiresAt: new Date(Date.now() + 10 * 60_000),
  customer: { name: 'Jane Doe', email: 'jane@example.com' },
});

const snapResponse = () =>
  jsonResponse(true, 201, {
    token: 'snap-token-1',
    redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/x',
  });

describe('MidtransClient', () => {
  let client: MidtransClient;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    client = new MidtransClient(config());
  });

  afterEach(() => jest.restoreAllMocks());

  it('creates a Snap transaction with the right URL, auth and body', async () => {
    fetchMock.mockResolvedValueOnce(snapResponse());

    await client.createSnapTransaction(createInput());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://app.sandbox.midtrans.com/snap/v1/transactions');

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from(`${SERVER_KEY}:`).toString('base64')}`,
    );
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Accept).toBe('application/json');

    const body = JSON.parse(init.body as string);
    expect(body.transaction_details.order_id).toBe(ORDER_ID);
    expect(body.transaction_details.gross_amount).toBe(200000);
    expect(Number.isInteger(body.transaction_details.gross_amount)).toBe(true);
    expect(body.expiry.unit).toBe('minute');
    expect(body.expiry.duration).toBeGreaterThanOrEqual(1);
    expect(body.expiry.duration).toBeLessThanOrEqual(10);
    expect(body.expiry.start_time).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \+0700$/,
    );
    expect(body.callbacks).toEqual({ finish: cfg.finishUrl });
    expect(body.customer_details.first_name).toBe('Jane Doe');
    expect(body.customer_details.email).toBe('jane@example.com');
    expect(body).not.toHaveProperty('enabled_payments');
  });

  it('omits callbacks and customer details when they are not configured', async () => {
    const bareClient = new MidtransClient({
      get: jest.fn().mockReturnValue({ ...cfg, finishUrl: '' }),
    } as unknown as ConfigService);
    fetchMock.mockResolvedValueOnce(snapResponse());

    await bareClient.createSnapTransaction({
      providerOrderId: ORDER_ID,
      amount: 50000,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).not.toHaveProperty('callbacks');
    expect(body).not.toHaveProperty('customer_details');
  });

  it('returns the token and redirect url from the response', async () => {
    fetchMock.mockResolvedValueOnce(snapResponse());

    await expect(client.createSnapTransaction(createInput())).resolves.toEqual({
      token: 'snap-token-1',
      redirectUrl: 'https://app.sandbox.midtrans.com/snap/v4/redirection/x',
    });
  });

  it('maps 401 to an unauthorized error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(false, 401, {}));

    const error = client.createSnapTransaction(createInput());

    await expect(error).rejects.toBeInstanceOf(MidtransApiError);
    await expect(error).rejects.toMatchObject({
      code: 'unauthorized',
      status: 401,
      path: '/snap/v1/transactions',
    });
  });

  it('maps 406 to an order id taken error', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(false, 406, { status_message: 'order_id sudah digunakan' }),
    );

    await expect(
      client.createSnapTransaction(createInput()),
    ).rejects.toMatchObject({ code: 'order_id_taken', status: 406 });
  });

  it('maps a 404 status lookup to not_found (customer has not paid yet)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(false, 404, {
        status_code: '404',
        status_message: 'Payment Not Found',
      }),
    );

    await expect(client.getStatus(ORDER_ID)).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
      path: `/v2/${ORDER_ID}/status`,
    });
  });

  it('maps a 5xx to request_failed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(false, 503, {}));

    await expect(client.getStatus(ORDER_ID)).rejects.toMatchObject({
      code: 'request_failed',
      status: 503,
    });
  });

  it('never leaks the server key in error messages', async () => {
    for (const status of [401, 404, 406, 500]) {
      fetchMock.mockResolvedValueOnce(jsonResponse(false, status, {}));

      const error = await client
        .getStatus(ORDER_ID)
        .then(() => null)
        .catch((caught: unknown) => caught as MidtransApiError);

      expect(error).toBeInstanceOf(MidtransApiError);
      expect(error?.message).not.toContain(SERVER_KEY);
      expect(error?.message).not.toContain('Basic ');
      expect(error?.message).not.toContain(
        Buffer.from(`${SERVER_KEY}:`).toString('base64'),
      );
    }
  });

  it('throws unauthorized when no server key is configured outside stub mode', async () => {
    const emptyKey = {
      ...cfg,
      serverKey: '',
    };
    const emptyClient = new MidtransClient({
      get: jest.fn().mockReturnValue(emptyKey),
    } as unknown as ConfigService);

    await expect(
      emptyClient.createSnapTransaction(createInput()),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the raw status fields, keeping gross amount as a string', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(true, 200, {
        order_id: ORDER_ID,
        status_code: '200',
        transaction_status: 'settlement',
        gross_amount: '200000.00',
        payment_type: 'bank_transfer',
        transaction_id: 'trx-1',
        fraud_status: 'accept',
      }),
    );

    const status = await client.getStatus(ORDER_ID);

    expect(status).toEqual({
      orderId: ORDER_ID,
      transactionStatus: 'settlement',
      fraudStatus: 'accept',
      grossAmount: '200000.00',
      paymentType: 'bank_transfer',
      transactionId: 'trx-1',
    });
    expect(typeof status.grossAmount).toBe('string');
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.sandbox.midtrans.com/v2/${ORDER_ID}/status`,
    );
  });

  it('expires a transaction through the core API', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(true, 200, {}));

    await expect(client.expire(ORDER_ID)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.sandbox.midtrans.com/v2/${ORDER_ID}/expire`,
    );
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });
});
