import 'dotenv/config';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaInvoicesRepository } from '../repository/invoices.prisma-repository';
import { InvoicesService } from '../service/invoices.service';

/**
 * Feature 07 (7.4) B2B invoice numbering integration tests against the real DB.
 * Numbering is per-year `INV-YYYY-NNNN` generated inside a transaction guarded
 * by a per-year advisory lock (docs/features/07-payments.md req 10).
 * Follows the repo pattern of src/modules/tests/test/tests-transaction.e2e-spec.ts.
 */
describe('Invoices E2E (integ, real DB)', () => {
  const prefix = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const year = new Date().getFullYear();
  const NUMBER_RE = new RegExp(`^INV-${year}-\\d{4}$`);

  let prisma: PrismaService;
  let service: InvoicesService;
  let institutionId: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const institution = await prisma.institution.create({
      data: {
        name: `${prefix} Institution`,
        contactName: 'E2E Contact',
        contactEmail: `${prefix}@test.local`,
      },
    });
    institutionId = institution.id;
    service = new InvoicesService(new PrismaInvoicesRepository(prisma));
  });

  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.institution.deleteMany({ where: { id: institutionId } });
    await prisma.$disconnect();
  });

  it('creates sequential per-year numbers (0001, 0002, …)', async () => {
    const first = await service.create({
      institutionId,
      amount: 5000000,
      notes: 'first',
    });
    const second = await service.create({
      institutionId,
      amount: 7500000,
      notes: 'second',
    });
    createdIds.push(first.id, second.id);

    expect(first.number).toMatch(NUMBER_RE);
    expect(second.number).toMatch(NUMBER_RE);
    const seq1 = parseInt(first.number.split('-')[2], 10);
    const seq2 = parseInt(second.number.split('-')[2], 10);
    expect(seq2).toBe(seq1 + 1);
    expect(first.status).toBe('UNPAID');
  });

  it('concurrent creates still produce unique numbers (advisory lock + P2002 retry)', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        service.create({
          institutionId,
          amount: 1000000 * (i + 1),
        }),
      ),
    );
    for (const r of results) {
      createdIds.push(r.id);
      expect(r.number).toMatch(NUMBER_RE);
    }
    const numbers = results.map((r) => r.number);
    expect(new Set(numbers).size).toBe(5);
    // All within the current per-year sequence are distinct
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('throws 404 for a non-existent institution', async () => {
    await expect(
      service.create({
        institutionId: '00000000-0000-4000-8000-000000000000',
        amount: 1000,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('updates status to PAID with notes', async () => {
    const invoice = await service.create({
      institutionId,
      amount: 3000000,
    });
    createdIds.push(invoice.id);
    const updated = await service.updateStatus(
      invoice.id,
      'PAID',
      'settled by transfer',
    );
    expect(updated.status).toBe('PAID');
    expect(updated.notes).toBe('settled by transfer');
  });
  it('resolves an invoice by its verification token', async () => {
    const invoice = await service.create({
      institutionId,
      amount: 1250000,
    });
    createdIds.push(invoice.id);

    const verified = await service.verify(invoice.verificationToken);

    expect(verified.number).toBe(invoice.number);
    expect(verified.amount).toBe(1250000);
    expect(verified.status).toBe('UNPAID');
    expect(verified.institutionName).toContain(prefix);
  });

  it('throws 404 for an unknown verification token', async () => {
    await expect(
      service.verify('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(NotFoundException);
  });
});
