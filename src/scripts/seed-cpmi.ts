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
import { archiveLegacyCpmi, buildCpmiData } from './lib/cpmi-seed';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SEED_DIR = join(__dirname, '../../prisma/seed-data');
const ASSET_DIR = join(SEED_DIR, 'assets/wpt');

async function main(): Promise<void> {
  const force = isForce(process.argv);
  const wpt = JSON.parse(
    readFileSync(join(SEED_DIR, 'wpt.json'), 'utf-8'),
  ) as SeedData;
  const data = buildCpmiData(wpt);

  if (await archiveLegacyCpmi(prisma)) {
    console.log('Renamed legacy "cpmi" to "cpmi-lama" (archived).');
  }

  // The four WPT figures are reused as-is; copying them again keeps this seed
  // self-contained on a server that never ran `seed:wpt`.
  const assets = installItemAssets(ASSET_DIR);
  const test = await upsertSeedTest(prisma, data.test, force);
  const items = await syncItems(prisma, test.id, data.items);
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
