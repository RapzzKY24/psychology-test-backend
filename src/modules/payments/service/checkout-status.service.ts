import { Injectable, NotFoundException } from '@nestjs/common';
import { InvoicesService } from '../../invoices/service/invoices.service';
import { OrdersService } from '../../orders/service/orders.service';
import type { CheckoutStatusDto } from '../dto/checkout-status.dto';
import { toInvoiceCheckout, toOrderCheckout } from '../dto/checkout-status.dto';
import { PaymentsService } from './payments.service';

/** Snap echoes `order_id` on the finish redirect; ids are uuid-ish and short. */
const MAX_REF_LENGTH = 64;

/**
 * Resolves the payment behind a finish redirect or a direct link, restricted to
 * the caller's own data. Invoices are checked first: their `providerOrderId`
 * is the id Snap sends back.
 */
@Injectable()
export class CheckoutStatusService {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
  ) {}

  async find(ref: string, userId: string): Promise<CheckoutStatusDto> {
    this.assertRef(ref);

    const invoice = await this.invoices.findOwnedByRef(ref, userId);
    if (invoice) return toInvoiceCheckout(invoice);

    const order = await this.orders.findOwnedByRef(ref, userId);
    if (order) return toOrderCheckout(order);

    // Never reveal whether the id exists for someone else.
    throw new NotFoundException('Checkout not found');
  }

  /**
   * `find` plus one gateway lookup. The Snap webhook cannot reach a dev host,
   * so the only fallback was the periodic recovery pass; asking the provider
   * here lets the buyer's page settle itself the moment it is opened.
   */
  async refresh(ref: string, userId: string): Promise<CheckoutStatusDto> {
    this.assertRef(ref);

    const invoice = await this.invoices.findOwnedByRef(ref, userId);
    if (invoice) {
      await this.payments.reconcileInvoice(invoice.invoice);
      return this.find(ref, userId);
    }

    const order = await this.orders.findOwnedByRef(ref, userId);
    if (order) {
      await this.payments.reconcileOrder(order.order);
      return this.find(ref, userId);
    }

    throw new NotFoundException('Checkout not found');
  }

  private assertRef(ref: string): void {
    if (!ref || ref.length > MAX_REF_LENGTH) {
      throw new NotFoundException('Checkout not found');
    }
  }
}
