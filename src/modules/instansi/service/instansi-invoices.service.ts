import { Injectable, NotFoundException } from '@nestjs/common';
import { InvoicesService } from '../../invoices/service/invoices.service';
import { InstansiParticipantsService } from './instansi-participants.service';
import {
  toInstansiInvoice,
  type InstansiInvoiceDto,
} from '../dto/instansi-invoice.dto';

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
}
