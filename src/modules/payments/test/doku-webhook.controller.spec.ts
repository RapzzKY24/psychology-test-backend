import 'reflect-metadata';

// @thallesp/nestjs-better-auth ships ESM-only (.mjs) which unit-test ts-jest
// cannot load — replicate the decorator so this spec exercises OUR handler.
jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
}));

import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';
import type { Request, Response } from 'express';
import { DokuWebhookController } from '../controller/doku-webhook.controller';
import type { PaymentNotification } from '../gateway/payment-notification';
import type { PaymentsService } from '../service/payments.service';

const CLIENT_ID = 'BRN-0295-test';
const SECRET_KEY = 'SK-test-secret';
const NOTIFICATION_PATH = '/api/v1/webhooks/doku/notification';
const INVOICE = 'INV-2026-0001';
const TIMESTAMP = '2026-11-03T09:15:00Z';
const REQUEST_ID = '2f1c9b0e-0000-4000-8000-000000000001';

interface MockResponse {
  status: jest.Mock;
  json: jest.Mock;
}

type SettleMock = jest.Mock<Promise<void>, [PaymentNotification]>;
type RecordMock = jest.Mock<
  Promise<void>,
  [{ source: string; payload: unknown }]
>;

function payload(overrides: Record<string, unknown> = {}): unknown {
  return {
    order: { invoice_number: INVOICE, amount: '200000.00' },
    transaction: { status: 'SUCCESS' },
    channel: { id: 'BCA_VA' },
    ...overrides,
  };
}

/** Mirrors the docs: labelled lines, digest over the raw bytes, no millis. */
function signature(rawBody: string): string {
  const digest = createHash('sha256').update(rawBody, 'utf8').digest('base64');
  const component = [
    `Client-Id:${CLIENT_ID}`,
    `Request-Id:${REQUEST_ID}`,
    `Request-Timestamp:${TIMESTAMP}`,
    `Request-Target:${NOTIFICATION_PATH}`,
    `Digest:${digest}`,
  ].join('\n');
  const hmac = createHmac('sha256', SECRET_KEY)
    .update(component, 'utf8')
    .digest('base64');
  return `HMACSHA256=${hmac}`;
}

function request(rawBody: string, signed: string | null): Request {
  return {
    rawBody: Buffer.from(rawBody, 'utf8'),
    headers: {
      'client-id': CLIENT_ID,
      'request-id': REQUEST_ID,
      'request-timestamp': TIMESTAMP,
      ...(signed === null ? {} : { signature: signed }),
    },
  } as unknown as Request;
}

function setup(secretKey: string = SECRET_KEY): {
  controller: DokuWebhookController;
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
  const get = jest.fn((key: string) => {
    if (key === 'app.doku.clientId') return CLIENT_ID;
    if (key === 'app.doku.secretKey') return secretKey;
    if (key === 'app.doku.notificationPath') return NOTIFICATION_PATH;
    return undefined;
  });
  const res: MockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const controller = new DokuWebhookController(
    { handleNotification, recordUnparsable } as unknown as PaymentsService,
    { get } as unknown as ConfigService,
  );
  return { controller, handleNotification, recordUnparsable, res };
}

describe('DokuWebhookController', () => {
  it('settles a correctly signed notification and acks', async () => {
    const { controller, handleNotification, res } = setup();
    const raw = JSON.stringify(payload());

    await controller.notification(
      request(raw, signature(raw)),
      JSON.parse(raw) as unknown,
      res as unknown as Response,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'OK' });
    expect(handleNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'DOKU',
        providerOrderId: INVOICE,
        status: 'PAID',
        paidAmount: 200000,
        paymentType: 'BCA_VA',
      }),
    );
  });

  it('rejects a forged signature before reading the body', async () => {
    const { controller, handleNotification, recordUnparsable, res } = setup();
    const raw = JSON.stringify(payload());

    await expect(
      controller.notification(
        request(raw, 'HMACSHA256=forged'),
        JSON.parse(raw) as unknown,
        res as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(handleNotification).not.toHaveBeenCalled();
    expect(recordUnparsable).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a signed request that carries no signature header', async () => {
    const { controller, res } = setup();
    const raw = JSON.stringify(payload());

    await expect(
      controller.notification(
        request(raw, null),
        JSON.parse(raw) as unknown,
        res as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('records a signed but unparsable body instead of settling it', async () => {
    const { controller, handleNotification, recordUnparsable, res } = setup();
    const body = { order: {} };
    const raw = JSON.stringify(body);

    await controller.notification(
      request(raw, signature(raw)),
      body,
      res as unknown as Response,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(recordUnparsable).toHaveBeenCalledWith({
      source: 'DOKU',
      payload: body,
    });
    expect(handleNotification).not.toHaveBeenCalled();
  });

  it('skips verification when no secret key is configured', async () => {
    const { controller, handleNotification, res } = setup('');
    const raw = JSON.stringify(payload());

    await controller.notification(
      request(raw, null),
      JSON.parse(raw) as unknown,
      res as unknown as Response,
    );

    expect(handleNotification).toHaveBeenCalledTimes(1);
  });
});
