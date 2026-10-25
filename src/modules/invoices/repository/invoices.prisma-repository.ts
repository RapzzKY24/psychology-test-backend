import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  Invoice,
  PaymentProvider,
  Prisma,
} from '../../../generated/prisma/client';
import type {
  ConfirmInvoicePaymentParams,
  ConfirmInvoicePaymentResult,
  InvoicesRepository,
} from './invoices.repository';
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

  createNextNumbered(params: {
    institutionId: string;
    amount: number;
    dueDate?: Date;
    notes?: string;
    year: number;
  }): Promise<Invoice> {
    return this.createNumbered(params);
  }

  createForSession(params: {
    institutionId: string;
    amount: number;
    sessionId: string;
    expiresAt?: Date;
    notes?: string;
  }): Promise<Invoice> {
    return this.createNumbered({
      institutionId: params.institutionId,
      amount: params.amount,
      sessionId: params.sessionId,
      expiresAt: params.expiresAt,
      notes: params.notes,
      year: new Date().getFullYear(),
    });
  }

  findBySessionId(sessionId: string): Promise<Invoice | null> {
    return this.prisma.invoice.findUnique({ where: { sessionId } });
  }

  findByVaNumber(vaNumber: string): Promise<Invoice | null> {
    return this.prisma.invoice.findUnique({ where: { vaNumber } });
  }

  /**
   * `providerOrderId` is the only key the gateway echoes back on a
   * notification, so this is the lookup used by the notification handler.
   */
  findByProviderOrderId(providerOrderId: string): Promise<Invoice | null> {
    return this.prisma.invoice.findUnique({ where: { providerOrderId } });
  }

  async confirmPaymentWithActivation(
    invoiceId: string,
    params: ConfirmInvoicePaymentParams,
  ): Promise<ConfirmInvoicePaymentResult> {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) return { outcome: 'not_found' };
      if (invoice.status === 'PAID') {
        return { outcome: 'already_paid', invoice };
      }
      if (invoice.status === 'CANCELLED') {
        return { outcome: 'conflict', reason: 'invoice_cancelled' };
      }
      if (params.paidAmount !== invoice.amount) {
        return { outcome: 'amount_mismatch' };
      }

      // Guarded update = exactly-once even under concurrent callbacks.
      const updated = await tx.invoice.updateMany({
        where: { id: invoiceId, status: 'UNPAID' },
        data: {
          status: 'PAID',
          verifiedBySource: params.verifiedBySource,
          verifiedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        const current = await tx.invoice.findUnique({
          where: { id: invoiceId },
        });
        if (current?.status === 'PAID') {
          return { outcome: 'already_paid', invoice: current };
        }
        return { outcome: 'conflict', reason: 'invoice_cancelled' };
      }

      if (invoice.sessionId) {
        await tx.testSession.updateMany({
          where: { id: invoice.sessionId, status: 'PENDING_PAYMENT' },
          data: { status: 'ACTIVE' },
        });
      }

      const settled = await tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
      });
      return { outcome: 'confirmed', invoice: settled };
    });
  }

  regenerateAmount(invoiceId: string, amount: number): Promise<Invoice> {
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        amount,
        // The VA was issued for the previous total, so void it here; the
        // service re-issues a fresh VA for the new amount (and the recovery
        // pass picks it up if that call fails).
        vaNumber: null,
        vaBankCode: null,
      },
    });
  }

  findUnpaidWithoutProviderOrderId(params: {
    provider: PaymentProvider;
    createdBefore: Date;
    limit: number;
  }): Promise<Invoice[]> {
    return this.prisma.invoice.findMany({
      where: {
        status: 'UNPAID',
        paymentProvider: params.provider,
        sessionId: { not: null },
        providerOrderId: null,
        createdAt: { lt: params.createdBefore },
      },
      orderBy: { createdAt: 'asc' },
      take: params.limit,
    });
  }

  findUnsettledInvoices(params: {
    provider: PaymentProvider;
    dueBefore: Date;
    notBefore: Date;
    limit: number;
  }): Promise<Invoice[]> {
    return this.prisma.invoice.findMany({
      where: {
        status: 'UNPAID',
        paymentProvider: params.provider,
        providerOrderId: { not: null },
        expiresAt: { lt: params.dueBefore, gte: params.notBefore },
      },
      orderBy: { expiresAt: 'asc' },
      take: params.limit,
    });
  }

  private async createNumbered(params: {
    institutionId: string;
    amount: number;
    dueDate?: Date;
    notes?: string;
    year: number;
    sessionId?: string;
    expiresAt?: Date;
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
              sessionId: params.sessionId,
              expiresAt: params.expiresAt,
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
