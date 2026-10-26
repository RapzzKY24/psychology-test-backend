import { Injectable, NotFoundException } from '@nestjs/common';
import { InvoicesService } from '../../invoices/service/invoices.service';
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
  ) {}

  async getById(
    userId: string,
    invoiceId: string,
  ): Promise<InstansiInvoiceDto> {
    const institutionId =
      await this.participantsService.resolveInstitutionId(userId);
    const invoice = await this.invoicesService.findById(invoiceId);
    if (invoice.institutionId !== institutionId) {
      throw new NotFoundException('Invoice not found');
    }
    return toInstansiInvoice(invoice);
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
