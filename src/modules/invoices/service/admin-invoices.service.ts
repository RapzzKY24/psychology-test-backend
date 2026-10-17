import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { INVOICES_REPOSITORY } from '../repository/invoices.repository';
import type { InvoicesRepository } from '../repository/invoices.repository';
import { EventLogService } from '../../event-log/service/event-log.service';
import type { Invoice } from '../../../generated/prisma/client';

const BREAK_GLASS_EVENT_TYPE = 'ADMIN_INVOICE_VERIFIED';

@Injectable()
export class AdminInvoicesService {
  constructor(
    @Inject(INVOICES_REPOSITORY)
    private readonly repo: InvoicesRepository,
    private readonly eventLog: EventLogService,
  ) {}

  /**
   * Emergency break-glass: mark a session invoice PAID and activate its session
   * without a gateway callback. Records the reason and actor for audit.
   */
  async verifyBreakGlass(
    id: string,
    reason: string,
    actorId: string,
  ): Promise<Invoice> {
    const invoice = await this.repo.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') {
      throw new ConflictException('invoice_not_payable');
    }

    const result = await this.repo.confirmPaymentWithActivation(id, {
      paidAmount: invoice.amount,
      verifiedBySource: 'ADMIN',
    });
    if (result.outcome !== 'confirmed') {
      throw new ConflictException('invoice_not_payable');
    }

    const event = await this.eventLog.record({
      source: 'MANUAL',
      direction: 'INBOUND',
      type: BREAK_GLASS_EVENT_TYPE,
      aggregateType: 'Invoice',
      aggregateId: id,
      payload: { actorId, reason, amount: invoice.amount },
    });
    await this.eventLog.markProcessed(event.id, {
      response: { invoiceId: id, sessionId: invoice.sessionId },
    });

    return result.invoice;
  }
}
