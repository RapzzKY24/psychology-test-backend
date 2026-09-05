import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Invoice, Prisma } from '../../../generated/prisma/client';
import type { InvoicesRepository } from './invoices.repository';
import { generateInvoiceNumber } from '../utils/generate-invoice-number';

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

  async institutionExists(id: string): Promise<boolean> {
    const institution = await this.prisma.institution.findUnique({
      where: { id },
      select: { id: true },
    });
    return institution !== null;
  }

  async createNextNumbered(params: {
    institutionId: string;
    amount: number;
    dueDate?: Date;
    notes?: string;
    year: number;
  }): Promise<Invoice> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          // pg_advisory_xact_lock returns void, which Prisma cannot
          // deserialize — and an unreferenced CTE would be pruned by
          // Postgres without taking the lock. Reference the CTE via
          // count(*) so the lock is acquired and a bigint is returned.
          await tx.$queryRaw`WITH "lock" AS (SELECT pg_advisory_xact_lock(hashtext(${`INV-${params.year}`}))) SELECT count(*) FROM "lock"`;
          const last = await tx.invoice.findFirst({
            where: { number: { startsWith: `INV-${params.year}-` } },
            orderBy: { number: 'desc' },
            select: { number: true },
          });
          const seq = last ? parseInt(last.number.split('-')[2], 10) + 1 : 1;
          const number = generateInvoiceNumber(params.year, seq);
          return tx.invoice.create({
            data: {
              institutionId: params.institutionId,
              amount: params.amount,
              number,
              dueDate: params.dueDate,
              notes: params.notes,
              status: 'UNPAID',
            },
          });
        });
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code === 'P2002') {
          lastError =
            error instanceof Error ? error : new Error('invoice_create_failed');
          continue;
        }
        throw error;
      }
    }
    throw lastError ?? new Error('invoice_create_failed');
  }
}
