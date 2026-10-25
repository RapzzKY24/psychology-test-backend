/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import { generateKeyPairSync } from 'node:crypto';
import { JokulClient } from '../client/jokul.client';
import { JokulTokenProvider } from '../client/jokul-token.provider';
import { JokulApiError } from '../errors/jokul-api.error';
import type { ConfigService } from '@nestjs/config';

describe('JokulClient', () => {
  let client: JokulClient;
  let fetchMock: jest.Mock;

  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const cfg = {
    baseUrl: 'https://sandbox.doku.com',
    clientId: 'cid',
    privateKey,
    secretKey: 'sec',
    partnerServiceId: '12345',
    channelId: 'H2H',
    bankCode: 'JOKUL',
    callbackUrl: 'https://host/webhooks/jokul/va',
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

  const config = () =>
    ({ get: jest.fn().mockReturnValue(cfg) }) as unknown as ConfigService;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    client = new JokulClient(config(), new JokulTokenProvider(config()));
  });

  afterEach(() => jest.restoreAllMocks());

  it('obtains and caches the access token', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    const tokens = new JokulTokenProvider(config());

    expect(await tokens.getAccessToken()).toBe('tok');
    expect(await tokens.getAccessToken()).toBe('tok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://sandbox.doku.com/authorization/v1/access-token/b2b',
    );
  });

  it('throws JokulApiError on a non-ok token response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({}),
    });
    const tokens = new JokulTokenProvider(config());

    await expect(tokens.getAccessToken()).rejects.toBeInstanceOf(JokulApiError);
  });

  it('creates a virtual account with the SNAP headers', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        responseCode: '2002700',
        responseMessage: 'Success',
        virtualAccountData: {
          virtualAccountNo: '000123450000000000000001',
          trxId: 'trx-1',
          additionalInfo: { referenceNo: 'ref-1' },
        },
      }),
    });

    const result = await client.createVirtualAccount(
      {
        partnerServiceId: '12345',
        customerNo: '0000000000000001',
        virtualAccountNo: '000123450000000000000001',
        virtualAccountName: 'John Doe',
        trxId: 'trx-1',
        virtualAccountTrxType: 'C',
        totalAmount: { value: '10000.00', currency: 'IDR' },
        expiredDate: '2026-07-15T10:00:00+07:00',
        additionalInfo: { channel: 'H2H' },
      },
      'ext-1',
    );

    expect(result).toEqual({
      virtualAccountNo: '000123450000000000000001',
      trxId: 'trx-1',
      referenceNo: 'ref-1',
    });

    const [url, init] = fetchMock.mock.calls[1];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe(
      'https://sandbox.doku.com/virtual-accounts/bi-snap-va/v1.1/transfer-va/create-va',
    );
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['X-EXTERNAL-ID']).toBe('ext-1');
    expect(headers['X-PARTNER-ID']).toBe('cid');
    expect(headers['CHANNEL-ID']).toBe('H2H');
    expect(headers['X-SIGNATURE']).toBeTruthy();
    expect(JSON.parse(init.body as string).additionalInfo.channel).toBe('H2H');
  });

  it('inquiries VA status reusing the caller-supplied external id', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        responseCode: '2002600',
        responseMessage: 'Success',
        virtualAccountData: {
          virtualAccountNo: '000123450000000000000001',
          paymentFlagStatus: '00',
          paidAmount: { value: '10000.00', currency: 'IDR' },
        },
      }),
    });

    const data = await client.inquiryVa(
      {
        partnerServiceId: '12345',
        customerNo: '0000000000000001',
        virtualAccountNo: '000123450000000000000001',
        inquiryRequestId: 'pr-1',
        trxDateInit: '2026-07-15T10:00:00+07:00',
      },
      'ext-retry-1',
    );

    expect(data).toEqual({
      virtualAccountNo: '000123450000000000000001',
      paymentFlagStatus: '00',
      paidAmount: 10000,
    });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(
      'https://sandbox.doku.com/virtual-accounts/bi-snap-va/v1.1/transfer-va/inquiry',
    );
    expect((init.headers as Record<string, string>)['X-EXTERNAL-ID']).toBe(
      'ext-retry-1',
    );
  });

  it('throws JokulApiError on a non-ok signed request', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    await expect(
      client.inquiryVa(
        {
          partnerServiceId: '12345',
          customerNo: '0000000000000001',
          virtualAccountNo: '000123450000000000000001',
          inquiryRequestId: 'pr-1',
          trxDateInit: '2026-07-15T10:00:00+07:00',
        },
        'ext-1',
      ),
    ).rejects.toBeInstanceOf(JokulApiError);
  });
});
