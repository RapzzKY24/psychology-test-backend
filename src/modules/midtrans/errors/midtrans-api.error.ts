export type MidtransApiErrorCode =
  'request_failed' | 'order_id_taken' | 'not_found' | 'unauthorized';

/**
 * Infrastructure-level failure talking to Midtrans. Carries a machine code so
 * the calling service maps it to an HTTP exception from the `api-contract.md`
 * catalog — this module never invents HTTP error messages itself.
 */
export class MidtransApiError extends Error {
  constructor(
    readonly code: MidtransApiErrorCode,
    message: string,
    readonly status?: number,
    readonly path?: string,
  ) {
    super(message);
    this.name = 'MidtransApiError';
  }
}
