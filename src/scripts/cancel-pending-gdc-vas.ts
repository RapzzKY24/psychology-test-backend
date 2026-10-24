import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * One-off migration for the GDC -> Doku switch: cancel every VA that was
 * provisioned before the cutover so customers check out again and receive a
 * Doku VA. Run once, at deploy time:
 *
 *   npm run migrate:cancel-gdc-vas -- 2026-10-24T00:00:00+07:00
 *
 * Without an argument every currently pending VA is cancelled.
 */
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const before = process.argv[2] ? new Date(process.argv[2]) : new Date();
  if (Number.isNaN(before.getTime())) {
    throw new Error(`Invalid cutoff date: ${process.argv[2]}`);
  }

  const orders = await prisma.order.updateMany({
    where: {
      status: 'PENDING',
      vaNumber: { not: null },
      createdAt: { lt: before },
    },
    data: {
      status: 'CANCELLED',
      cancelReason: 'gateway_migrated_to_doku',
    },
  });

  const invoices = await prisma.invoice.updateMany({
    where: {
      status: 'UNPAID',
      vaNumber: { not: null },
      createdAt: { lt: before },
    },
    data: { status: 'CANCELLED' },
  });

  console.log(
    `Cancelled ${orders.count} VA orders and ${invoices.count} VA invoices created before ${before.toISOString()}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
