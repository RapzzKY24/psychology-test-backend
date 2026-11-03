import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { toPublicInvoiceVerification } from '../dto/public-invoice-verification.dto';
import type { PublicInvoiceVerificationDto } from '../dto/public-invoice-verification.dto';

@Injectable()
export class InvoicesService {
  constructor(
    @Inject(INVOICES_REPOSITORY)
    private readonly repo: InvoicesRepository,
    private readonly config: ConfigService,
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
    // The payment window is the invoice's own clock, not the session's: a batch
    // stays open for a month, a payable link does not.
    return this.repo.createForSession({
      ...data,
      expiresAt: data.expiresAt ?? this.defaultPaymentWindow(),
    });
  }

  private defaultPaymentWindow(): Date {
    const minutes = this.config.get<number>('app.invoicePaymentTtlMin', 1440);
    return new Date(Date.now() + minutes * 60_000);
  }

  findBySessionId(sessionId: string): Promise<Invoice | null> {
    return this.repo.findBySessionId(sessionId);
  }

  /** Dipakai halaman publik /validasi/<token> — dipindai dari QR di PDF. */
  async verify(
    verificationToken: string,
  ): Promise<PublicInvoiceVerificationDto> {
    const row = await this.repo.findByVerificationToken(verificationToken);
    if (!row) throw new NotFoundException('invoice_not_found');
    return toPublicInvoiceVerification(row);
  }

  /** Provider-agnostic lookup: the id Midtrans echoes back on every notification. */
  findByProviderOrderId(providerOrderId: string): Promise<Invoice | null> {
    return this.repo.findByProviderOrderId(providerOrderId);
  }

  /** Record the method the customer actually paid with (best effort). */
  async updatePaymentType(
    invoiceId: string,
    paymentType: string,
  ): Promise<void> {
    await this.repo.update(invoiceId, { paymentType });
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

  findOwnedByRef(
    ref: string,
    ownerUserId: string,
  ): Promise<{ invoice: Invoice; testNames: string[] } | null> {
    return this.repo.findOwnedByRef(ref, ownerUserId);
  }

  findUnsettledInvoices(params: {
    provider: PaymentProvider;
    createdBefore: Date;
    notBefore: Date;
    limit: number;
  }): Promise<Invoice[]> {
    return this.repo.findUnsettledInvoices(params);
  }

  findByInstitution(params: {
    institutionId: string;
    skip: number;
    take: number;
  }): Promise<{
    data: Array<
      Invoice & { session: { title: string; slotLimit: number } | null }
    >;
    total: number;
  }> {
    return this.repo.findByInstitution(params);
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
    if (!invoice) throw new NotFoundException('invoice_not_found');
    return invoice;
  }

  async updateStatus(
    id: string,
    status: Invoice['status'],
    notes?: string,
  ): Promise<Invoice> {
    const invoice = await this.repo.findById(id);
    if (!invoice) throw new NotFoundException('invoice_not_found');
    return this.repo.update(id, {
      status,
      notes,
    });
  }
}
