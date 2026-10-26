export const MIDTRANS_NOTIFICATION_SCOPE = 'midtrans.notification';

export const MIDTRANS_NOTIFICATION_EVENT_TYPE = 'PAYMENT_NOTIFICATION_RECEIVED';

export interface MidtransAck {
  ok: true;
}

export const MIDTRANS_ACK: MidtransAck = { ok: true } as const;
