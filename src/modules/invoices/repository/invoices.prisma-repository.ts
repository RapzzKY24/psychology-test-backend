import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Invoice, Prisma } from '../../../generated/prisma/client';
import type { InvoicesRepository } from './invoices.repository';

@Injectable()
export class PrismaInvoicesRepository implements InvoicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Invoice | null> {
    return this.prisma.invoice.findUnique({ where: { id } });
  }

  async findMany(params: {
    where: Prisma.InvoiceWhereInput;
    skip: number;
    take: number;
    orderBy?: Prisma.InvoiceOrderByWithRelationInput;
  }): Promise<{ data: Invoice[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy ?? { createdAt: 'desc' },
      }),
      this.prisma.invoice.count({ where: params.where }),
    ]);
    return { data, total };
  }

  create(data: Prisma.InvoiceCreateInput): Promise<Invoice> {
    return this.prisma.invoice.create({ data });
  }

  update(id: string, data: Prisma.InvoiceUpdateInput): Promise<Invoice> {
    return this.prisma.invoice.update({ where: { id }, data });
  }

  async findLastNumberForYear(year: number): Promise<string | null> {
    const prefix = `INV-${year}-`;
    const last = await this.prisma.invoice.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    return last?.number ?? null;
  }
}
