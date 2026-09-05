export function generateInvoiceNumber(year: number, seq: number): string {
  return `INV-${year}-${String(seq).padStart(4, '0')}`;
}
