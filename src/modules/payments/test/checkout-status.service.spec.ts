import { NotFoundException } from '@nestjs/common';
import { CheckoutStatusService } from '../service/checkout-status.service';
import type { InvoicesService } from '../../invoices/service/invoices.service';
import type { OrdersService } from '../../orders/service/orders.service';
import type { Invoice, Order } from '../../../generated/prisma/client';

const USER_ID = 'user-1';

function makeService() {
  const invoices = { findOwnedByRef: jest.fn() };
  const orders = { findOwnedByRef: jest.fn() };
  const service = new CheckoutStatusService(
    invoices as unknown as InvoicesService,
    orders as unknown as OrdersService,
  );
  return { service, invoices, orders };
}

const invoice = (over: Partial<Invoice> = {}): Invoice =>
  ({
    id: 'inv1',
    status: 'PAID',
    amount: 400000,
    sessionId: 'sess1',
    verifiedAt: new Date('2026-10-26T07:37:22Z'),
    ...over,
  }) as Invoice;

const order = (over: Partial<Order> = {}): Order =>
  ({
    id: 'ord1',
    status: 'PENDING',
    amount: 75000,
    verifiedAt: null,
    ...over,
  }) as Order;

describe('CheckoutStatusService', () => {
  it('returns the invoice with its session test names', async () => {
    const { service, invoices, orders } = makeService();
    invoices.findOwnedByRef.mockResolvedValue({
      invoice: invoice(),
      testNames: ['DISC Form A', 'CPMI'],
    });

    const result = await service.find('inv1', USER_ID);

    expect(result).toEqual({
      kind: 'invoice',
      id: 'inv1',
      status: 'PAID',
      amount: 400000,
      testNames: ['DISC Form A', 'CPMI'],
      sessionId: 'sess1',
      paidAt: '2026-10-26T07:37:22.000Z',
    });
    expect(orders.findOwnedByRef).not.toHaveBeenCalled();
  });

  it('falls back to a personal order and maps PENDING to UNPAID', async () => {
    const { service, invoices, orders } = makeService();
    invoices.findOwnedByRef.mockResolvedValue(null);
    orders.findOwnedByRef.mockResolvedValue({
      order: order(),
      testName: 'DISC Form A',
    });

    const result = await service.find('ord1', USER_ID);

    expect(result).toMatchObject({
      kind: 'order',
      id: 'ord1',
      status: 'UNPAID',
      testNames: ['DISC Form A'],
      sessionId: null,
      paidAt: null,
    });
  });

  it('throws 404 when the reference belongs to someone else', async () => {
    const { service, invoices, orders } = makeService();
    invoices.findOwnedByRef.mockResolvedValue(null);
    orders.findOwnedByRef.mockResolvedValue(null);

    await expect(service.find('inv-other', USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects an oversized reference without querying', async () => {
    const { service, invoices, orders } = makeService();

    await expect(service.find('x'.repeat(65), USER_ID)).rejects.toThrow(
      NotFoundException,
    );
    expect(invoices.findOwnedByRef).not.toHaveBeenCalled();
    expect(orders.findOwnedByRef).not.toHaveBeenCalled();
  });
});
