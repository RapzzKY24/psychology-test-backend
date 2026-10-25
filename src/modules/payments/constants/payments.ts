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
