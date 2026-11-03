import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoicesService } from '../../invoices/service/invoices.service';
import { InvoicePaymentService } from '../../invoices/service/invoice-payment.service';
import { InvoicePdfService } from '../../invoices/service/invoice-pdf.service';
import type { InvoicePdfFile } from '../../invoices/service/invoice-pdf.service';
import { InstansiParticipantsService } from './instansi-participants.service';
import {
  toInstansiInvoice,
  toInstansiInvoiceRow,
  type InstansiInvoiceDto,
} from '../dto/instansi-invoice.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';

/** Institution-scoped reads of batch invoices. */
@Injectable()
export class InstansiInvoicesService {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly participantsService: InstansiParticipantsService,
    private readonly pdfService: InvoicePdfService,
    private readonly invoicePayment: InvoicePaymentService,
  ) {}

  /**
   * Unduh ulang invoice dari dashboard. Kepemilikan dicek di query, jadi
   * invoice milik institusi lain menghasilkan 404 — bukan 403 — supaya
   * keberadaan barisnya tidak bocor.
   */
  async renderPdf(userId: string, invoiceId: string): Promise<InvoicePdfFile> {
    const institutionId =
      await this.participantsService.resolveInstitutionId(userId);
    return this.pdfService.render({ id: invoiceId, institutionId });
  }

  async getById(
    userId: string,
    invoiceId: string,
  ): Promise<InstansiInvoiceDto> {
    const institutionId =
      await this.participantsService.resolveInstitutionId(userId);
    const invoice = await this.invoicesService.findById(invoiceId);
    if (invoice.institutionId !== institutionId) {
      throw new NotFoundException('invoice_not_found');
    }
    return toInstansiInvoice(invoice);
  }

  /**
   * Re-issue the payment link after a provisioning failure (gateway down, a
   * rejected request). Safe to call when a link already exists: `provision`
   * returns the invoice untouched once it has a provider order.
   */
  async retryPayment(
    userId: string,
    invoiceId: string,
  ): Promise<InstansiInvoiceDto> {
    const institutionId =
      await this.participantsService.resolveInstitutionId(userId);
    const invoice = await this.invoicesService.findById(invoiceId);
    if (invoice.institutionId !== institutionId) {
      throw new NotFoundException('invoice_not_found');
    }
    if (invoice.status !== 'UNPAID') {
      throw new ConflictException('invoice_not_payable');
    }

    // No name passed: the billing contact on the invoice is what the gateway
    // needs, and it is resolved inside the payment service.
    const updated = await this.invoicePayment.provision(invoice.id);
    if (!updated) throw new NotFoundException('invoice_not_found');
    return toInstansiInvoice(updated);
  }

  /**
   * Every invoice of the caller's institution — the navbar payment list.
   * Unpaid first so the rows that still need an action stay on top.
   */
  async list(
    userId: string,
    pagination: { page: number; limit: number },
  ): Promise<PaginatedResponse<InstansiInvoiceDto>> {
    const institutionId =
      await this.participantsService.resolveInstitutionId(userId);
    const { data, total } = await this.invoicesService.findByInstitution({
      institutionId,
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    });
    return {
      data: data.map(toInstansiInvoiceRow),
      meta: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }
}
