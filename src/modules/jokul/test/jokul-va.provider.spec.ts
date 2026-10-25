import { JokulVaProvider } from '../gateway/jokul-va.provider';
import type {
  CreateVirtualAccountResult,
  JokulClient,
  InquiryVaResult,
} from '../client/jokul.client';
import type {
  CreateVirtualAccountInput,
  InquiryVaInput,
} from '../dto/jokul.dto';
import type { ConfigService } from '@nestjs/config';

describe('JokulVaProvider', () => {
  const cfg = {
    baseUrl: 'https://sandbox.doku.com',
    clientId: 'cid',
    privateKey: 'key',
    secretKey: 'sec',
    partnerServiceId: '12345',
    channelId: 'H2H',
    bankCode: 'JOKUL',
    callbackUrl: 'https://host/webhooks/jokul/va',
  };

  const config = () =>
    ({ get: jest.fn().mockReturnValue(cfg) }) as unknown as ConfigService;

  function setup(): {
    provider: JokulVaProvider;
    createVirtualAccount: jest.Mock<
      Promise<CreateVirtualAccountResult>,
      [CreateVirtualAccountInput, string]
    >;
    inquiryVa: jest.Mock<Promise<InquiryVaResult>, [InquiryVaInput, string]>;
  } {
    const createVirtualAccount = jest.fn<
      Promise<CreateVirtualAccountResult>,
      [CreateVirtualAccountInput, string]
    >();
    const inquiryVa = jest.fn<
      Promise<InquiryVaResult>,
      [InquiryVaInput, string]
    >();
    const jokul = {
      createVirtualAccount,
      inquiryVa,
    } as unknown as JokulClient;
    return {
      provider: new JokulVaProvider(jokul, config()),
      createVirtualAccount,
      inquiryVa,
    };
  }

  it('derives a stable VA number from the partner service id + external id', async () => {
    const { provider, createVirtualAccount } = setup();
    createVirtualAccount.mockResolvedValue({
      virtualAccountNo: '000123450000000000000001',
      trxId: 'order-1',
      referenceNo: 'ref-1',
    });

    const first = await provider.createPayment({
      externalId: 'order-1',
      amount: 200000,
      customer: { name: 'Budi' },
      expiresAt: new Date('2026-10-24T10:00:00Z'),
    });
    await provider.createPayment({
      externalId: 'order-1',
      amount: 200000,
      customer: { name: 'Budi' },
      expiresAt: new Date('2026-10-24T10:00:00Z'),
    });

    expect(first.vaNumber).toBe('000123450000000000000001');
    expect(first.bankCode).toBe('JOKUL');
    expect(first.transactionId).toBe('order-1');
    expect(first.providerOrderId).toBe('order-1');
    expect(createVirtualAccount).toHaveBeenCalledTimes(2);
    const firstInput = createVirtualAccount.mock.calls[0][0];
    const secondInput = createVirtualAccount.mock.calls[1][0];
    expect(firstInput.customerNo).toBe(secondInput.customerNo);
    expect(firstInput.virtualAccountNo).toBe(
      `${'12345'.padStart(8, '0')}${firstInput.customerNo}`,
    );
    expect(firstInput.totalAmount).toEqual({
      value: '200000.00',
      currency: 'IDR',
    });
  });

  it('splits the VA number when inquiring and maps the paid flag', async () => {
    const { provider, inquiryVa } = setup();
    inquiryVa.mockResolvedValue({
      virtualAccountNo: '000123450000000000000001',
      paymentFlagStatus: '00',
      paidAmount: 200000,
    });

    const result = await provider.getStatus({
      providerOrderId: 'ext-1',
      vaNumber: '000123450000000000000001',
    });

    expect(result).toEqual({
      providerOrderId: 'ext-1',
      status: 'PAID',
      paidAmount: 200000,
      paymentType: null,
    });
    expect(inquiryVa).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerServiceId: '00012345',
        customerNo: '0000000000000001',
        inquiryRequestId: 'ext-1',
      }),
      'ext-1',
    );
  });

  it('maps a non-settled inquiry to PENDING', async () => {
    const { provider, inquiryVa } = setup();
    inquiryVa.mockResolvedValue({
      virtualAccountNo: '000123450000000000000001',
      paymentFlagStatus: null,
      paidAmount: null,
    });

    const result = await provider.getStatus({
      providerOrderId: 'ext-1',
      vaNumber: '000123450000000000000001',
    });

    expect(result.status).toBe('PENDING');
  });
});
