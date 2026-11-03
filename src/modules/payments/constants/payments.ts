/**
 * Event type recorded for every inbound payment callback, whatever the provider.
 * The value is persisted in `event_log.type`, so it must never change.
 */
export const PAYMENT_NOTIFICATION_EVENT_TYPE = 'PAYMENT_NOTIFICATION_RECEIVED';

/** Snap answers `{ ok: true }`; a provider with a different ack owns its own. */
export interface MidtransAck {
  ok: true;
}

export const MIDTRANS_ACK: MidtransAck = { ok: true } as const;
