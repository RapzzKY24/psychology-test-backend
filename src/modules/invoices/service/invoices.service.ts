import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { INVOICES_REPOSITORY } from '../repository/invoices.repository';
import type { InvoicesRepository } from '../repository/invoices.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { generateInvoiceNumber } from '../utils/generate-invoice-number';
import type { Invoice, Prisma } from '../../../generated/prisma/client';
import type { QueryInvoicesDto } from '../dto/query-invoices.dto';

@Injectable()
export class InvoicesService {
  constructor(
    @Inject(INVOICES_REPOSITORY)
    private readonly repo: InvoicesRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(dto: {
    institutionId: string;
    amount: number;
    dueDate?: Date;
    notes?: string;
  }): Promise<Invoice> {
    const institution = await this.prisma.institution.findUnique({
      where: { id: dto.institutionId },
      select: { id: true },
    });
    if (!institution) throw new NotFoundException('Institution not found');

    const year = new Date().getFullYear();
    const invoice = await this.prisma.$transaction(async (tx) => {
      // Lock per-year invoice rows to prevent duplicate numbers under concurrency
      await tx.$queryRaw`SELECT id FROM "invoices" WHERE number LIKE ${`INV-${year}-%`} FOR UPDATE`;
      const last = await tx.invoice.findFirst({
        where: { number: { startsWith: `INV-${year}-` } },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      const seq = last ? parseInt(last.number.split('-')[2], 10) + 1 : 1;
      const number = generateInvoiceNumber(year, seq);
      return tx.invoice.create({
        data: {
          institutionId: dto.institutionId,
          amount: dto.amount,
          number,
          dueDate: dto.dueDate,
          notes: dto.notes,
          status: 'UNPAID',
        },
      });
    });
    return invoice;
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
    status: string,
    notes?: string,
  ): Promise<Invoice> {
    const invoice = await this.repo.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    return this.repo.update(id, {
      status: status as unknown as Invoice['status'],
      notes,
    });
  }
}
