import 'dotenv/config';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';
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
const ASSET_DIR = join(SEED_DIR, 'assets/wpt');

type AssetManifest = {
  items: { item: number; file: string; imageUrl: string }[];
};

/**
 * Item figures are committed under prisma/seed-data/assets because `uploads/`
 * is gitignored. Copying them keeps a fresh VPS seed self-contained, and the
 * fixed uuids in the manifest keep `imageUrl` stable across re-seeds.
 */
function installAssets(): number {
  const manifestPath = join(ASSET_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) return 0;
  const manifest = JSON.parse(
    readFileSync(manifestPath, 'utf-8'),
  ) as AssetManifest;
  const uploadRoot = process.env.UPLOAD_DIR ?? './uploads';
  const targetDir = join(uploadRoot, 'test-items');
  mkdirSync(targetDir, { recursive: true });
  for (const entry of manifest.items) {
    copyFileSync(
      join(ASSET_DIR, entry.file),
      join(targetDir, basename(entry.imageUrl)),
    );
  }
  return manifest.items.length;
}

async function main(): Promise<void> {
  // Without --force a routine seed never touches price or status: both are
  // admin-owned once the test exists (see lib/seed-test.ts).
  const force = isForce(process.argv);
  const data = JSON.parse(
    readFileSync(join(SEED_DIR, 'wpt.json'), 'utf-8'),
  ) as SeedData;

  const assets = installAssets();
  const test = await upsertSeedTest(prisma, data.test, force);
  const items = await syncItems(prisma, test.id, data.items);
  const interps = await syncInterpretations(
    prisma,
    test.id,
    data.interpretations,
  );

  // CPMI is another name for WPT: archive the legacy instrument instead of
  // deleting it, so old sessions and attempts keep resolving. Public links
  // (`/tes/cpmi`) redirect to `/tes/wpt`.
  const archived = await prisma.test.updateMany({
    where: { slug: 'cpmi', status: { not: 'ARCHIVED' } },
    data: {
      status: 'ARCHIVED',
      description:
        'Digabung ke WPT — CPMI adalah nama lain dari Wonderlic Personnel Test.',
    },
  });

  console.log(
    `Seeded ${data.test.slug}: items ${describeSync(items)}, interpretations ${describeSync(interps)}, ${assets} figures`,
  );
  console.log(
    force
      ? 'price + status overwritten (--force).'
      : 'price + status left untouched — add --force to overwrite them.',
  );
  if (archived.count > 0) {
    console.log('Archived legacy "cpmi" test (alias of wpt).');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
