import 'dotenv/config';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import { PrismaClient } from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { TestCategory, ScorerType } from '../generated/prisma/enums';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SEED_DIR = join(__dirname, '../../prisma/seed-data');
const ASSET_DIR = join(SEED_DIR, 'assets/wpt');

type SeedData = {
  test: {
    slug: string;
    name: string;
    description: string;
    category: string;
    scorerType: string;
    price: number;
    estimatedDurationMin: number;
    /** Hard limit enforced by the attempt service; null = untimed. */
    timeLimitMin?: number | null;
    /** Raw -> IQ conversion rows consumed by the scorer. */
    normTable?: { raw: number; iq: number }[] | null;
  };
  items: { order: number; content: unknown }[];
  interpretations: { patternCode: string; title: string; body: string }[];
};

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
  const data = JSON.parse(
    readFileSync(join(SEED_DIR, 'wpt.json'), 'utf-8'),
  ) as SeedData;

  const assets = installAssets();

  const fields = {
    name: data.test.name,
    description: data.test.description,
    category: data.test.category as unknown as TestCategory,
    scorerType: data.test.scorerType as unknown as ScorerType,
    price: data.test.price,
    estimatedDurationMin: data.test.estimatedDurationMin,
    timeLimitMin: data.test.timeLimitMin ?? null,
    normTable: (data.test.normTable ?? null) as Prisma.InputJsonValue,
    status: 'PUBLISHED' as const,
  };

  const test = await prisma.test.upsert({
    where: { slug: data.test.slug },
    update: fields,
    create: { slug: data.test.slug, ...fields },
  });

  // Items: delete + create in transaction for idempotency
  await prisma.$transaction(async (tx) => {
    await tx.testItem.deleteMany({ where: { testId: test.id } });
    if (data.items.length > 0) {
      await tx.testItem.createMany({
        data: data.items.map((it) => ({
          testId: test.id,
          order: it.order,
          content: it.content as Prisma.InputJsonValue,
        })),
      });
    }
  });

  // Interpretations: delete + create
  await prisma.$transaction(async (tx) => {
    await tx.interpretation.deleteMany({ where: { testId: test.id } });
    if (data.interpretations.length > 0) {
      await tx.interpretation.createMany({
        data: data.interpretations.map((interp) => ({
          testId: test.id,
          patternCode: interp.patternCode,
          title: interp.title,
          body: interp.body,
        })),
      });
    }
  });

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

  const itemCount = await prisma.testItem.count({ where: { testId: test.id } });
  const interpCount = await prisma.interpretation.count({
    where: { testId: test.id },
  });
  console.log(
    `Seeded ${data.test.slug}: ${itemCount} items, ${interpCount} interpretations, ${assets} figures, status PUBLISHED`,
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
