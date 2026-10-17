/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import { generateKeyPairSync } from 'node:crypto';
import { GdcClient } from '../client/gdc.client';
import type { ConfigService } from '@nestjs/config';

describe('GdcClient', () => {
  let client: GdcClient;
  let fetchMock: jest.Mock;

  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const cfg = {
    baseUrl: 'https://sandbox/snap',
    clientId: 'cid',
    clientSecret: 'sec',
    privateKey,
    partnerId: 'pid',
    channelId: 'chid',
    accountNumber: 'acc',
    callbackUrl: 'https://host/webhooks/gdc/va',
  };

  const tokenResponse = () => ({
    ok: true,
    status: 200,
    json: async () => ({
      responseCode: '2007300',
      responseMessage: 'Success',
      accessToken: 'tok',
      tokenType: 'Bearer',
      expiresIn: '900',
    }),
  });

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    const config = {
      get: jest.fn().mockReturnValue(cfg),
    } as unknown as ConfigService;
    client = new GdcClient(config);
  });

  afterEach(() => jest.restoreAllMocks());

  it('obtains and caches the access token', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());

    expect(await client.getAccessToken()).toBe('tok');
    expect(await client.getAccessToken()).toBe('tok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws gdc_access_token_failed on a non-ok token response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({}),
    });

    await expect(client.getAccessToken()).rejects.toThrow(
      'gdc_access_token_failed',
    );
  });

  it('creates a virtual account with the SNAP headers', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        responseCode: '2002700',
        responseMessage: 'Success',
        virtualAccountData: {
          virtualAccountNo: '1900817280416463011',
          trxId: 'trx-1',
          additionalInfo: { referenceNo: 'ref-1' },
        },
      }),
    });

    const result = await client.createVirtualAccount(
      {
        virtualAccountName: 'John Doe',
        expiredDate: '2026-07-15T10:00:00+07:00',
        trxId: 'trx-1',
        virtualAccountTrxType: 'C',
        totalAmount: { value: '10000.00', currency: 'IDR' },
        accountNumber: 'acc',
        bankCode: '014',
      },
      'ext-1',
    );

    expect(result).toEqual({
      virtualAccountNo: '1900817280416463011',
      trxId: 'trx-1',
      referenceNo: 'ref-1',
    });

    const [url, init] = fetchMock.mock.calls[1];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe('https://sandbox/snap/v1.0/transfer-va/create-va');
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['X-EXTERNAL-ID']).toBe('ext-1');
    expect(headers['X-PARTNER-ID']).toBe('pid');
    expect(headers['X-Signature']).toBeTruthy();
    expect(JSON.parse(init.body as string).additionalInfo.bankCode).toBe('014');
  });

  it('inquiries VA status and returns virtualAccountData', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        responseCode: '2002600',
        responseMessage: 'Success',
        virtualAccountData: {
          virtualAccountNo: '1900',
          paymentFlagStatus: '00',
          paymentFlagReason: 'PAID',
        },
      }),
    });

    const data = await client.inquiryVaStatus({
      virtualAccountNo: '1900',
      paymentRequestId: 'pr-1',
    });

    expect(data.paymentFlagStatus).toBe('00');
    const [url] = fetchMock.mock.calls[1];
    expect(url).toBe('https://sandbox/snap/v1.0/transfer-va/status');
  });
});
