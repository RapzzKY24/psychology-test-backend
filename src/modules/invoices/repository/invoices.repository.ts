import type { Invoice, Prisma } from '../../../generated/prisma/client';

export const INVOICES_REPOSITORY = 'InvoicesRepository';

export interface InvoicesRepository {
  findById(id: string): Promise<Invoice | null>;
  findMany(params: {
    where: Prisma.InvoiceWhereInput;
    skip: number;
    take: number;
    orderBy?: Prisma.InvoiceOrderByWithRelationInput;
  }): Promise<{ data: Invoice[]; total: number }>;
  create(data: Prisma.InvoiceCreateInput): Promise<Invoice>;
  update(id: string, data: Prisma.InvoiceUpdateInput): Promise<Invoice>;
  findLastNumberForYear(year: number): Promise<string | null>;
}
