import { mapTransactionStatus } from '../utils/map-status';

describe('mapTransactionStatus', () => {
  it('maps settlement to PAID', () => {
    expect(mapTransactionStatus('settlement')).toBe('PAID');
  });

  it('is case-insensitive', () => {
    expect(mapTransactionStatus('SETTLEMENT')).toBe('PAID');
    expect(mapTransactionStatus('Expire')).toBe('EXPIRED');
  });

  it('maps capture to PAID when the fraud verdict is accept', () => {
    expect(mapTransactionStatus('capture', 'accept')).toBe('PAID');
  });

  it('maps capture to PAID when there is no fraud verdict', () => {
    expect(mapTransactionStatus('capture')).toBe('PAID');
    expect(mapTransactionStatus('capture', null)).toBe('PAID');
  });

  it('maps a denied capture to PENDING (never settled)', () => {
    expect(mapTransactionStatus('capture', 'deny')).toBe('PENDING');
    expect(mapTransactionStatus('CAPTURE', 'DENY')).toBe('PENDING');
  });

  it('maps expire to EXPIRED', () => {
    expect(mapTransactionStatus('expire')).toBe('EXPIRED');
  });

  it('maps deny, cancel and failure to FAILED', () => {
    expect(mapTransactionStatus('deny')).toBe('FAILED');
    expect(mapTransactionStatus('cancel')).toBe('FAILED');
    expect(mapTransactionStatus('failure')).toBe('FAILED');
  });

  it('keeps refunds and chargebacks PAID — the money did arrive', () => {
    expect(mapTransactionStatus('refund')).toBe('PAID');
    expect(mapTransactionStatus('partial_refund')).toBe('PAID');
    expect(mapTransactionStatus('chargeback')).toBe('PAID');
    expect(mapTransactionStatus('partial_chargeback')).toBe('PAID');
  });

  it('falls back to PENDING for pending, authorize, empty and unknown values', () => {
    expect(mapTransactionStatus('pending')).toBe('PENDING');
    expect(mapTransactionStatus('authorize')).toBe('PENDING');
    expect(mapTransactionStatus('')).toBe('PENDING');
    expect(mapTransactionStatus('something-new')).toBe('PENDING');
  });
});
