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
  institutionExists(id: string): Promise<boolean>;
  /** Create an invoice with the next INV-YYYY-NNNN number for the given year,
   * serialized by a per-year advisory lock inside one transaction. */
  createNextNumbered(params: {
    institutionId: string;
    amount: number;
    dueDate?: Date;
    notes?: string;
    year: number;
  }): Promise<Invoice>;
}
