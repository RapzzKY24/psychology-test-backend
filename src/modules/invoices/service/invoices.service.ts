import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { INVOICES_REPOSITORY } from '../repository/invoices.repository';
import type {
  ConfirmInvoicePaymentParams,
  ConfirmInvoicePaymentResult,
  InvoicesRepository,
} from '../repository/invoices.repository';
import type {
  Invoice,
  PaymentProvider,
  Prisma,
} from '../../../generated/prisma/client';
import type { QueryInvoicesDto } from '../dto/query-invoices.dto';

@Injectable()
export class InvoicesService {
  constructor(
    @Inject(INVOICES_REPOSITORY)
    private readonly repo: InvoicesRepository,
  ) {}

  async create(dto: {
    institutionId: string;
    amount: number;
    dueDate?: Date;
    notes?: string;
  }): Promise<Invoice> {
    if (!(await this.repo.institutionExists(dto.institutionId))) {
      throw new NotFoundException('Institution not found');
    }
    return this.repo.createNextNumbered({
      institutionId: dto.institutionId,
      amount: dto.amount,
      dueDate: dto.dueDate,
      notes: dto.notes,
      year: new Date().getFullYear(),
    });
  }

  async createForSession(data: {
    institutionId: string;
    amount: number;
    sessionId: string;
    expiresAt?: Date;
    notes?: string;
  }): Promise<Invoice> {
    if (!(await this.repo.institutionExists(data.institutionId))) {
      throw new NotFoundException('Institution not found');
    }
    return this.repo.createForSession(data);
  }

  findBySessionId(sessionId: string): Promise<Invoice | null> {
    return this.repo.findBySessionId(sessionId);
  }

  findByVaNumber(vaNumber: string): Promise<Invoice | null> {
    return this.repo.findByVaNumber(vaNumber);
  }

  confirmPaymentWithActivation(
    invoiceId: string,
    params: ConfirmInvoicePaymentParams,
  ): Promise<ConfirmInvoicePaymentResult> {
    return this.repo.confirmPaymentWithActivation(invoiceId, params);
  }

  regenerateAmount(invoiceId: string, amount: number): Promise<Invoice> {
    return this.repo.regenerateAmount(invoiceId, amount);
  }

  findUnpaidWithoutProviderOrderId(params: {
    provider: PaymentProvider;
    createdBefore: Date;
    limit: number;
  }): Promise<Invoice[]> {
    return this.repo.findUnpaidWithoutProviderOrderId(params);
  }

  findUnsettledInvoices(params: {
    provider: PaymentProvider;
    dueBefore: Date;
    notBefore: Date;
    limit: number;
  }): Promise<Invoice[]> {
    return this.repo.findUnsettledInvoices(params);
  }

  async findMany(
    query: QueryInvoicesDto,
  ): Promise<{ data: Invoice[]; total: number }> {
    const where: Prisma.InvoiceWhereInput = {};
    if (query.institutionId) where.institutionId = query.institutionId;
    if (query.status) where.status = query.status;
    const skip = (query.page - 1) * query.limit;
    return this.repo.findMany({ where, skip, take: query.limit });
  }

  async findById(id: string): Promise<Invoice> {
    const invoice = await this.repo.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async updateStatus(
    id: string,
    status: Invoice['status'],
    notes?: string,
  ): Promise<Invoice> {
    const invoice = await this.repo.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    return this.repo.update(id, {
      status,
      notes,
    });
  }
}
