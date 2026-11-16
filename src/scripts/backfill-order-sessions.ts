import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { generateInviteToken } from '../modules/sessions/utils/generate-invite-token';

/**
 * Repair paid orders that never got the session they paid for.
 *
 * Orders settled before settlement recorded `sessionId` have no link to any
 * work, so the purchase tab can only show a dead row. This script rebuilds
 * exactly what settlement would have produced: one INDIVIDUAL session, one
 * attempt owned by the buyer, and the link between them.
 *
 * Idempotent: it only touches `PAID` orders whose `sessionId` is still null,
 * and re-reads that inside the transaction so a concurrent settlement wins.
 *
 * Run: npm run backfill:order-sessions -- --dry-run
 *      npm run backfill:order-sessions
 */

const SESSION_TTL_DAYS = 30;

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const orders = await prisma.order.findMany({
    where: { status: 'PAID', sessionId: null },
    select: {
      id: true,
      userId: true,
      testId: true,
      verifiedAt: true,
      test: { select: { name: true } },
    },
    orderBy: { verifiedAt: 'asc' },
  });

  console.log(`${orders.length} paid order(s) without a session`);
  if (orders.length === 0) {
    await prisma.$disconnect();
    return;
  }

  let repaired = 0;

  for (const order of orders) {
    if (dryRun) {
      console.log(`would rebuild ${order.id} — ${order.test.name}`);
      continue;
    }

    const didRepair = await prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: order.id },
        select: { status: true, sessionId: true },
      });
      if (!current || current.status !== 'PAID' || current.sessionId) {
        return false;
      }

      const session = await tx.testSession.create({
        data: {
          kind: 'INDIVIDUAL',
          title: `Personal · ${order.test.name}`,
          token: generateInviteToken(),
          slotLimit: 1,
          // A fresh window, not the original one: the buyer is starting the
          // work now, and a session created already-expired is useless.
          expiresAt: new Date(
            Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
          ),
          status: 'ACTIVE',
        },
      });

      // `startedAt` stays at "now" on purpose: backdating it would hand a
      // timed test an attempt whose clock ran out before the buyer saw it.
      await tx.attempt.create({
        data: {
          sessionId: session.id,
          testId: order.testId,
          userId: order.userId,
          status: 'IN_PROGRESS',
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { sessionId: session.id },
      });
      return true;
    });

    if (didRepair) {
      repaired += 1;
      console.log(`rebuilt ${order.id} — ${order.test.name}`);
    } else {
      console.log(`skipped ${order.id} — already linked or no longer PAID`);
    }
  }

  console.log(
    dryRun
      ? `dry run: ${orders.length} order(s) would be repaired`
      : `repaired ${repaired} order(s)`,
  );
  await prisma.$disconnect();
}

void main();
