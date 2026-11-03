import { mapDokuStatus } from '../utils/map-doku-status';

describe('mapDokuStatus', () => {
  it('maps the settlement states', () => {
    expect(mapDokuStatus('SUCCESS')).toBe('PAID');
    expect(mapDokuStatus('EXPIRED')).toBe('EXPIRED');
  });

  it('treats every terminal failure as FAILED', () => {
    for (const status of ['FAILED', 'VOID', 'VOIDED', 'CANCELLED']) {
      expect(mapDokuStatus(status)).toBe('FAILED');
    }
  });

  it('keeps a refund settled, matching the Snap mapper', () => {
    // A refund must never make an order look unpaid: that would re-open a
    // settled order for payment.
    expect(mapDokuStatus('REFUNDED')).toBe('PAID');
  });

  it('treats everything else as still pending', () => {
    expect(mapDokuStatus('PENDING')).toBe('PENDING');
    expect(mapDokuStatus('')).toBe('PENDING');
    expect(mapDokuStatus('something-new')).toBe('PENDING');
  });

  it('ignores case and surrounding whitespace', () => {
    expect(mapDokuStatus(' success ')).toBe('PAID');
  });
});
