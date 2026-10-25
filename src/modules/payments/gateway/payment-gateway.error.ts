/**
 * Base class for infrastructure failures raised by a payment provider
 * transport.
 *
 * Services above the seam catch this instead of a provider-specific class, so
 * swapping Jokul for Midtrans never leaves a raw 500 leaking to the client.
 * Each provider keeps its own narrow `code` union.
 */
export abstract class PaymentGatewayError extends Error {
  protected constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
    readonly path?: string,
  ) {
    super(message);
  }
}
