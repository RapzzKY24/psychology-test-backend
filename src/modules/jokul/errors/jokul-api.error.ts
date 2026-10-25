import { PaymentGatewayError } from '../../payments/gateway/payment-gateway.error';

export type JokulApiErrorCode = 'access_token_failed' | 'request_failed';

/**
 * Infrastructure-level failure talking to Jokul. Carries a machine code so the
 * calling service maps it to an HTTP exception from the `api-contract.md`
 * catalog — this module never invents HTTP error messages itself.
 */
export class JokulApiError extends PaymentGatewayError {
  constructor(
    code: JokulApiErrorCode,
    message: string,
    status?: number,
    path?: string,
  ) {
    super(code, message, status, path);
    this.name = 'JokulApiError';
  }
}
