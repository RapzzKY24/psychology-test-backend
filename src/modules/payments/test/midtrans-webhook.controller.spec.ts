import 'reflect-metadata';

// @thallesp/nestjs-better-auth ships ESM-only (.mjs) which unit-test ts-jest
// cannot load — replicate the decorator so this spec exercises OUR handler.
jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
}));

import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import { MidtransWebhookController } from '../controller/midtrans-webhook.controller';
import type { PaymentNotification } from '../gateway/payment-notification';
import type { PaymentsService } from '../service/payments.service';

const SERVER_KEY = 'SB-Mid-server-test-key';
const ORDER_ID = 'INV-2026-0001';
const STATUS_CODE = '200';
const GROSS_AMOUNT = '200000.00';

function sign(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
): string {
  return createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');
}

function notification(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    order_id: ORDER_ID,
    status_code: STATUS_CODE,
    gross_amount: GROSS_AMOUNT,
    signature_key: sign(ORDER_ID, STATUS_CODE, GROSS_AMOUNT, SERVER_KEY),
    transaction_status: 'settlement',
    transaction_id: 'trx-1',
    payment_type: 'bank_transfer',
    ...overrides,
  };
}

interface MockResponse {
  status: jest.Mock;
  json: jest.Mock;
}

type SettleMock = jest.Mock<Promise<void>, [PaymentNotification]>;
type RecordMock = jest.Mock<
  Promise<void>,
  [{ source: string; payload: unknown }]
>;

function setup(serverKey: string = SERVER_KEY): {
  controller: MidtransWebhookController;
  handleNotification: SettleMock;
  recordUnparsable: RecordMock;
  res: MockResponse;
} {
  const handleNotification: SettleMock = jest.fn<
    Promise<void>,
    [PaymentNotification]
  >();
  handleNotification.mockResolvedValue(undefined);
  const recordUnparsable: RecordMock = jest.fn<
    Promise<void>,
    [{ source: string; payload: unknown }]
  >();
  recordUnparsable.mockResolvedValue(undefined);
  const get = jest.fn().mockReturnValue(serverKey);
  const res: MockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const controller = new MidtransWebhookController(
    { handleNotification, recordUnparsable } as unknown as PaymentsService,
    { get } as unknown as ConfigService,
  );
  return { controller, handleNotification, recordUnparsable, res };
}

describe('MidtransWebhookController', () => {
  describe('notification', () => {
    it('acks a valid notification and hands the service a neutral shape', async () => {
      const { controller, handleNotification, res } = setup();
      const body = notification();

      await controller.notification(body, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
      expect(handleNotification).toHaveBeenCalledTimes(1);
      // Provider field names stop at the controller: the service only sees the
      // mapped notification.
      expect(handleNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'MIDTRANS',
          providerOrderId: ORDER_ID,
          status: 'PAID',
          paidAmount: 200000,
        }),
      );
    });

    it('rejects a forged signature without calling the service', async () => {
      const { controller, handleNotification, res } = setup();
      const body = notification({ signature_key: 'deadbeef' });

      await expect(
        controller.notification(body, res as unknown as Response),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(handleNotification).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('records an unparsable body instead of settling it', async () => {
      const { controller, handleNotification, recordUnparsable, res } = setup();
      const body = { unexpected: 'shape' };

      await controller.notification(body, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
      expect(recordUnparsable).toHaveBeenCalledWith({
        source: 'MIDTRANS',
        payload: body,
      });
      expect(handleNotification).not.toHaveBeenCalled();
    });

    it('skips verification when the server key is empty', async () => {
      const { controller, handleNotification, res } = setup('');
      const body = notification({ signature_key: 'not-a-real-signature' });

      await controller.notification(body, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
      expect(handleNotification).toHaveBeenCalledTimes(1);
    });
  });
});
