export const VA_CALLBACK_SCOPE = 'jokul.va.callback';

export const VA_CALLBACK_KEY_PREFIX = 'jokul.va.callback:';

export const VA_CALLBACK_EVENT_TYPE = 'VA_CALLBACK_RECEIVED';

export const VA_CALLBACK_PAID_STATUS = '00';

export const VA_INQUIRY_PAID_STATUS = '00';

export const JOKUL_ACK = {
  responseCode: '2002700',
  responseMessage: 'Successful',
} as const;

export interface JokulAck {
  responseCode: string;
  responseMessage: string;
}

export const MIDTRANS_NOTIFICATION_SCOPE = 'midtrans.notification';

export const MIDTRANS_NOTIFICATION_EVENT_TYPE = 'PAYMENT_NOTIFICATION_RECEIVED';

export interface MidtransAck {
  ok: true;
}

export const MIDTRANS_ACK: MidtransAck = { ok: true } as const;
