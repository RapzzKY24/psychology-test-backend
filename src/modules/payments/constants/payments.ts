export const VA_CALLBACK_SCOPE = 'gdc.va.callback';

export const VA_CALLBACK_KEY_PREFIX = 'gdc.va.callback:';

export const VA_CALLBACK_PAID_STATUS = '00';

export const GDC_ACK = {
  responseCode: '2000000',
  responseMessage: 'Successful',
} as const;

export interface GdcAck {
  responseCode: string;
  responseMessage: string;
}
