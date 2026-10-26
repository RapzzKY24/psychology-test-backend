import {
  InstansiInvoiceSchema,
  toInstansiInvoice,
  toInstansiInvoiceRow,
} from '../dto/instansi-invoice.dto';

describe('toInstansiInvoice', () => {
  const invoice = {
    id: 'inv1',
    number: 'INV-2026-0001',
    amount: 200000,
    status: 'UNPAID',
    sessionId: 's1',
    vaNumber: null,
    vaBankCode: null,
    paymentUrl: 'https://app.sandbox.midtrans.com/snap/v4/redirection/tok',
    paymentToken: 'tok',
    expiresAt: new Date('2026-10-27T00:00:00.000Z'),
  };

  it('passes the Snap payment url and token through', () => {
    const dto = toInstansiInvoice(invoice as never);

    expect(dto.paymentUrl).toBe(invoice.paymentUrl);
    expect(dto.paymentToken).toBe('tok');
    expect(InstansiInvoiceSchema.safeParse(dto).success).toBe(true);
  });

  it('keeps the VA fields and leaves the Snap fields null for Jokul', () => {
    const dto = toInstansiInvoice({
      ...invoice,
      vaNumber: '8801234',
      vaBankCode: '014',
      paymentUrl: null,
      paymentToken: null,
    } as never);

    expect(dto.vaNumber).toBe('8801234');
    expect(dto.vaBankCode).toBe('014');
    expect(dto.paymentUrl).toBeNull();
    expect(dto.paymentToken).toBeNull();
  });

  it('carries the batch title and seat count for the payment list', () => {
    const dto = toInstansiInvoiceRow({
      ...invoice,
      session: { title: 'DISC Form A — Batch Oktober', slotLimit: 50 },
    } as never);

    expect(dto.sessionTitle).toBe('DISC Form A — Batch Oktober');
    expect(dto.slotLimit).toBe(50);
    expect(InstansiInvoiceSchema.safeParse(dto).success).toBe(true);
  });

  it('leaves the session fields null when the invoice has no session', () => {
    const dto = toInstansiInvoiceRow({
      ...invoice,
      sessionId: null,
      session: null,
    } as never);

    expect(dto.sessionTitle).toBeNull();
    expect(dto.slotLimit).toBeNull();
    expect(InstansiInvoiceSchema.safeParse(dto).success).toBe(true);
  });
});
