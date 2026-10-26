import type { ConfigService } from '@nestjs/config';
import type {
  CreateSnapTransactionInput,
  MidtransClient,
  MidtransStatusResult,
  SnapTransactionResult,
} from '../client/midtrans.client';
import { MidtransApiError } from '../errors/midtrans-api.error';
import { MidtransSnapProvider } from '../gateway/midtrans-snap.provider';
import type {
  CreatePaymentParams,
  GatewayPaymentStatus,
} from '../../payments/gateway/payment-gateway.interface';

type CreateSnapMock = jest.Mock<
  Promise<SnapTransactionResult>,
  [CreateSnapTransactionInput]
>;
type StatusMock = jest.Mock<Promise<MidtransStatusResult>, [string]>;

const EXTERNAL_ID = 'INV-2026-0001';

const config = (): ConfigService =>
  ({ get: jest.fn() }) as unknown as ConfigService;

const createParams = (
  overrides: Partial<CreatePaymentParams> = {},
): CreatePaymentParams => ({
  externalId: EXTERNAL_ID,
  amount: 200000,
  expiresAt: new Date('2026-10-25T10:00:00Z'),
  customer: { name: 'Jane Doe', email: 'jane@example.com' },
  ...overrides,
});

const snapResult = (): SnapTransactionResult => ({
  token: 'snap-token-1',
  redirectUrl: 'https://app.sandbox.midtrans.com/snap/v4/redirection/x',
});

const statusResult = (
  overrides: Partial<MidtransStatusResult> = {},
): MidtransStatusResult => ({
  orderId: EXTERNAL_ID,
  transactionStatus: 'pending',
  fraudStatus: null,
  grossAmount: '200000.00',
  paymentType: 'bank_transfer',
  transactionId: 'trx-1',
  ...overrides,
});

function setup(): {
  provider: MidtransSnapProvider;
  createSnapTransaction: CreateSnapMock;
  getStatus: StatusMock;
} {
  const createSnapTransaction: CreateSnapMock = jest.fn<
    Promise<SnapTransactionResult>,
    [CreateSnapTransactionInput]
  >();
  const getStatus: StatusMock = jest.fn<
    Promise<MidtransStatusResult>,
    [string]
  >();
  const client = {
    createSnapTransaction,
    getStatus,
  } as unknown as MidtransClient;
  return {
    provider: new MidtransSnapProvider(client, config()),
    createSnapTransaction,
    getStatus,
  };
}

describe('MidtransSnapProvider', () => {
  describe('createPayment', () => {
    it('returns the Snap token and redirect url under the external id', async () => {
      const { provider, createSnapTransaction } = setup();
      createSnapTransaction.mockResolvedValueOnce(snapResult());

      const result = await provider.createPayment(createParams());

      expect(result).toEqual({
        providerOrderId: EXTERNAL_ID,
        token: 'snap-token-1',
        redirectUrl: 'https://app.sandbox.midtrans.com/snap/v4/redirection/x',
        transactionId: '',
      });
      expect(createSnapTransaction).toHaveBeenCalledTimes(1);
      expect(createSnapTransaction).toHaveBeenCalledWith({
        providerOrderId: EXTERNAL_ID,
        amount: 200000,
        expiresAt: new Date('2026-10-25T10:00:00Z'),
        customer: { name: 'Jane Doe', email: 'jane@example.com' },
      });
    });

    it('retries once with a suffixed order id when Midtrans says order_id_taken', async () => {
      const { provider, createSnapTransaction } = setup();
      createSnapTransaction
        .mockRejectedValueOnce(
          new MidtransApiError(
            'order_id_taken',
            'order_id sudah digunakan',
            406,
          ),
        )
        .mockResolvedValueOnce(snapResult());

      const result = await provider.createPayment(createParams());

      expect(createSnapTransaction).toHaveBeenCalledTimes(2);
      expect(result.providerOrderId).toMatch(
        new RegExp(`^${EXTERNAL_ID}-[0-9a-z]+$`),
      );
      expect(result.providerOrderId).not.toBe(EXTERNAL_ID);
      expect(createSnapTransaction.mock.calls[1][0].providerOrderId).toBe(
        result.providerOrderId,
      );
      expect(result.token).toBe('snap-token-1');
    });

    it('keeps the retry order id within the 50-character Midtrans cap', async () => {
      const { provider, createSnapTransaction } = setup();
      // Invoice reprovision ids are `<uuid>-<amount>`, already 44 characters.
      const longExternalId = '123e4567-e89b-12d3-a456-426614174000-2000000';
      createSnapTransaction
        .mockRejectedValueOnce(
          new MidtransApiError(
            'order_id_taken',
            'order_id sudah digunakan',
            406,
          ),
        )
        .mockResolvedValueOnce(snapResult());

      const result = await provider.createPayment(
        createParams({ externalId: longExternalId }),
      );

      expect(result.providerOrderId.length).toBeLessThanOrEqual(50);
      expect(result.providerOrderId.startsWith('123e4567-e89b')).toBe(true);
      expect(result.providerOrderId).not.toBe(longExternalId);
    });

    it('re-throws any other Midtrans error without retrying', async () => {
      const { provider, createSnapTransaction } = setup();
      const failure = new MidtransApiError(
        'request_failed',
        'Midtrans request failed',
        500,
      );
      createSnapTransaction.mockRejectedValueOnce(failure);

      await expect(provider.createPayment(createParams())).rejects.toBe(
        failure,
      );
      expect(createSnapTransaction).toHaveBeenCalledTimes(1);
    });

    it('re-throws non-Midtrans errors unchanged', async () => {
      const { provider, createSnapTransaction } = setup();
      createSnapTransaction.mockRejectedValueOnce(new Error('socket hang up'));

      await expect(provider.createPayment(createParams())).rejects.toThrow(
        'socket hang up',
      );
      expect(createSnapTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStatus', () => {
    const cases: Array<[string, string | null, GatewayPaymentStatus]> = [
      ['settlement', null, 'PAID'],
      ['capture', 'accept', 'PAID'],
      ['capture', 'deny', 'PENDING'],
      ['expire', null, 'EXPIRED'],
      ['deny', null, 'FAILED'],
      ['refund', null, 'PAID'],
    ];

    it.each(cases)(
      'maps %s (fraud: %s) to %s',
      async (transactionStatus, fraudStatus, expected) => {
        const { provider, getStatus } = setup();
        getStatus.mockResolvedValueOnce(
          statusResult({ transactionStatus, fraudStatus }),
        );

        const result = await provider.getStatus({
          providerOrderId: EXTERNAL_ID,
        });

        expect(result.status).toBe(expected);
        expect(result.providerOrderId).toBe(EXTERNAL_ID);
        expect(getStatus).toHaveBeenCalledWith(EXTERNAL_ID);
      },
    );

    it('parses the decimal gross_amount string into a number', async () => {
      const { provider, getStatus } = setup();
      getStatus.mockResolvedValueOnce(
        statusResult({ transactionStatus: 'settlement' }),
      );

      const result = await provider.getStatus({
        providerOrderId: EXTERNAL_ID,
      });

      expect(result.paidAmount).toBe(200000);
      expect(typeof result.paidAmount).toBe('number');
      expect(result.paymentType).toBe('bank_transfer');
    });

    it('treats a not_found lookup as PENDING instead of throwing', async () => {
      const { provider, getStatus } = setup();
      getStatus.mockRejectedValueOnce(
        new MidtransApiError(
          'not_found',
          'Midtrans request failed: /v2/x/status (HTTP 404)',
          404,
          `/v2/${EXTERNAL_ID}/status`,
        ),
      );

      await expect(
        provider.getStatus({ providerOrderId: EXTERNAL_ID }),
      ).resolves.toEqual({
        providerOrderId: EXTERNAL_ID,
        status: 'PENDING',
        paidAmount: null,
        paymentType: null,
      });
    });

    it('re-throws other status errors', async () => {
      const { provider, getStatus } = setup();
      const failure = new MidtransApiError('unauthorized', 'unauthorized', 401);
      getStatus.mockRejectedValueOnce(failure);

      await expect(
        provider.getStatus({ providerOrderId: EXTERNAL_ID }),
      ).rejects.toBe(failure);
    });
  });
});
