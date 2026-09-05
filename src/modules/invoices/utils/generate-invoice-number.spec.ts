import { generateInvoiceNumber } from './generate-invoice-number';

describe('generateInvoiceNumber', () => {
  it('should format INV-YYYY-NNNN', () => {
    expect(generateInvoiceNumber(2026, 1)).toBe('INV-2026-0001');
    expect(generateInvoiceNumber(2026, 42)).toBe('INV-2026-0042');
    expect(generateInvoiceNumber(2026, 1234)).toBe('INV-2026-1234');
  });
});
