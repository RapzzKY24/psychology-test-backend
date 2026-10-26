import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { INVOICES_REPOSITORY } from '../repository/invoices.repository';
import type { InvoicesRepository } from '../repository/invoices.repository';
import { EventLogService } from '../../event-log/service/event-log.service';
import {
  toAdminInvoiceDetail,
  type AdminInvoiceDetailDto,
} from '../dto/admin-invoice-detail.dto';
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
   * Admin invoice popup: who bought what, for how much. One query, so the
   * dialog does not have to stitch three lists together on the client.
   */
  async findDetail(id: string): Promise<AdminInvoiceDetailDto> {
    const row = await this.repo.findDetailById(id);
    if (!row) throw new NotFoundException('Invoice not found');
    return toAdminInvoiceDetail(row);
  }

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
