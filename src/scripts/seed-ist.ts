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
import { installItemAssets } from './lib/seed-assets';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SEED_DIR = join(__dirname, '../../prisma/seed-data');
const ASSET_DIR = join(SEED_DIR, 'assets/ist');

// `ist.json` declares an age band (13 years to 100) even though the oldest
// norm band is a catch-all. The band is not a marketing range: it is what makes
// the platform ask for a birth date and store it on the attempt, and the scorer
// reads the norm row from that stored date. Without it every participant would
// be scored with no standard score and no IQ.
async function main(): Promise<void> {
  // Without --force a routine seed never touches price or status: both are
  // admin-owned once the test exists (see lib/seed-test.ts).
  const force = isForce(process.argv);
  const data = JSON.parse(
    readFileSync(join(SEED_DIR, 'ist.json'), 'utf-8'),
  ) as SeedData;

  const assets = installItemAssets(ASSET_DIR);
  const test = await upsertSeedTest(prisma, data.test, force);
  const items = await syncItems(prisma, test.id, data.items);
  // IST reports an IQ and a profile, not a typology: the norms live in
  // `scoringConfig` and there is no code a psychologist could fill in.
  const interps = await syncInterpretations(
    prisma,
    test.id,
    data.interpretations,
  );

  console.log(
    `Seeded ${data.test.slug}: items ${describeSync(items)}, interpretations ${describeSync(interps)}, ${assets} figures`,
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
