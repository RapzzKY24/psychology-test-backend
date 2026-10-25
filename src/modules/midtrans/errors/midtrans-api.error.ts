import { PaymentGatewayError } from '../../payments/gateway/payment-gateway.error';

export type MidtransApiErrorCode =
  'request_failed' | 'order_id_taken' | 'not_found' | 'unauthorized';

/**
 * Infrastructure-level failure talking to Midtrans. Carries a machine code so
 * the calling service maps it to an HTTP exception from the `api-contract.md`
 * catalog — this module never invents HTTP error messages itself.
 */
export class MidtransApiError extends PaymentGatewayError {
  constructor(
    code: MidtransApiErrorCode,
    message: string,
    status?: number,
    path?: string,
  ) {
    super(code, message, status, path);
    this.name = 'MidtransApiError';
  }
}
