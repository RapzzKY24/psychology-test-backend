export type GdcApiErrorCode = 'access_token_failed' | 'request_failed';

/**
 * Infrastructure-level failure talking to GDC. Carries a machine code so the
 * calling service maps it to an HTTP exception from the `api-contract.md`
 * catalog — this module never invents HTTP error messages itself.
 */
export class GdcApiError extends Error {
  constructor(
    readonly code: GdcApiErrorCode,
    message: string,
    readonly status?: number,
    readonly path?: string,
  ) {
    super(message);
    this.name = 'GdcApiError';
  }
}
