import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  describeSync,
  isForce,
  syncInterpretations,
  syncItems,
  upsertSeedTest,
  type SeedData,
} from './lib/seed-test';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SEED_DIR = join(__dirname, '../../prisma/seed-data');

async function main(): Promise<void> {
  // Without --force a routine seed never touches price or status: both are
  // admin-owned once the test exists (see lib/seed-test.ts).
  const force = isForce(process.argv);
  const data = JSON.parse(
    readFileSync(join(SEED_DIR, 'msdt.json'), 'utf-8'),
  ) as SeedData;

  const test = await upsertSeedTest(prisma, data.test, force);
  const items = await syncItems(prisma, test.id, data.items);
  const interps = await syncInterpretations(
    prisma,
    test.id,
    data.interpretations,
  );

  console.log(
    `Seeded ${data.test.slug}: items ${describeSync(items)}, interpretations ${describeSync(interps)}`,
  );
  console.log(
    force
      ? 'price + status overwritten (--force).'
      : 'price + status left untouched — add --force to overwrite them.',
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
