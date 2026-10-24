import { DokuVaProvider } from '../gateway/doku-va.provider';
import type {
  CreateVirtualAccountResult,
  DokuClient,
  InquiryVaResult,
} from '../client/doku.client';
import type {
  CreateVirtualAccountInput,
  InquiryVaInput,
} from '../dto/doku.dto';
import type { ConfigService } from '@nestjs/config';

describe('DokuVaProvider', () => {
  const cfg = {
    baseUrl: 'https://sandbox.doku.com',
    clientId: 'cid',
    privateKey: 'key',
    secretKey: 'sec',
    partnerServiceId: '12345',
    channelId: 'H2H',
    bankCode: 'DOKU',
    callbackUrl: 'https://host/webhooks/doku/va',
  };

  const config = () =>
    ({ get: jest.fn().mockReturnValue(cfg) }) as unknown as ConfigService;

  function setup(): {
    provider: DokuVaProvider;
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
    const doku = {
      createVirtualAccount,
      inquiryVa,
    } as unknown as DokuClient;
    return {
      provider: new DokuVaProvider(doku, config()),
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

    const first = await provider.createVa({
      externalId: 'order-1',
      amount: 200000,
      name: 'Budi',
      expiresAt: new Date('2026-10-24T10:00:00Z'),
    });
    await provider.createVa({
      externalId: 'order-1',
      amount: 200000,
      name: 'Budi',
      expiresAt: new Date('2026-10-24T10:00:00Z'),
    });

    expect(first.vaNumber).toBe('000123450000000000000001');
    expect(first.bankCode).toBe('DOKU');
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

    const result = await provider.inquiryVa({
      vaNumber: '000123450000000000000001',
      paymentRequestId: 'pr-1',
      externalId: 'ext-1',
    });

    expect(result).toEqual({
      vaNumber: '000123450000000000000001',
      status: '00',
      paidAmount: 200000,
    });
    expect(inquiryVa).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerServiceId: '00012345',
        customerNo: '0000000000000001',
        inquiryRequestId: 'pr-1',
      }),
      'ext-1',
    );
  });
});
