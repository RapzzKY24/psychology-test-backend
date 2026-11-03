import {
  toDokuPaymentNotification,
  toStoredDokuPaymentNotification,
} from '../utils/to-payment-notification';
import type { DokuNotification } from '../dto/doku.dto';

const callback: DokuNotification = {
  order: { invoice_number: 'order-1-150000', amount: '150000.00' },
  transaction: {
    status: 'SUCCESS',
    original_request_id: 'req-1',
    date: '2026-11-03T09:15:00Z',
  },
  channel: { id: 'VIRTUAL_ACCOUNT_BCA' },
};

describe('toDokuPaymentNotification', () => {
  it('normalises the callback into the neutral shape', () => {
    expect(toDokuPaymentNotification(callback)).toEqual({
      source: 'DOKU',
      providerOrderId: 'order-1-150000',
      status: 'PAID',
      paidAmount: 150000,
      paymentType: 'VIRTUAL_ACCOUNT_BCA',
      rawStatus: 'SUCCESS',
      cancelled: false,
      idempotencyKey: 'order-1-150000:SUCCESS',
      payload: {
        invoice_number: 'order-1-150000',
        amount: '150000.00',
        status: 'SUCCESS',
        channel: 'VIRTUAL_ACCOUNT_BCA',
        reference_no: 'req-1',
        transaction_date: '2026-11-03T09:15:00Z',
      },
    });
  });

  it('marks a terminal failure as cancelled so the order stops waiting', () => {
    const failed = toDokuPaymentNotification({
      ...callback,
      transaction: { status: 'VOID' },
    });
    expect(failed.status).toBe('FAILED');
    expect(failed.cancelled).toBe(true);
  });
});

describe('toStoredDokuPaymentNotification', () => {
  it('rebuilds the same notification the ingress path produced', () => {
    const original = toDokuPaymentNotification(callback);

    expect(toStoredDokuPaymentNotification(original.payload)).toEqual(original);
  });

  it('keeps the idempotency key, so a replay is deduped', () => {
    const original = toDokuPaymentNotification(callback);
    const rebuilt = toStoredDokuPaymentNotification(original.payload);

    expect(rebuilt?.idempotencyKey).toBe(original.idempotencyKey);
  });

  it('survives a stored payload with no amount', () => {
    const original = toDokuPaymentNotification({
      ...callback,
      order: { invoice_number: 'order-2-0' },
    });
    const rebuilt = toStoredDokuPaymentNotification(original.payload);

    expect(rebuilt?.paidAmount).toBeNull();
  });

  it('returns null for a payload that no longer parses', () => {
    expect(
      toStoredDokuPaymentNotification({ invoice_number: 'order-1-150000' }),
    ).toBeNull();
    expect(toStoredDokuPaymentNotification(null)).toBeNull();
  });
});
