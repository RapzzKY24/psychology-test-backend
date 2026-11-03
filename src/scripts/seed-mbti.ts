import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { TestCategory, ScorerType } from '../generated/prisma/enums';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SEED_DIR = join(__dirname, '../../prisma/seed-data');

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
  };
  items: { order: number; content: unknown }[];
  interpretations: { patternCode: string; title: string; body: string }[];
};

async function main(): Promise<void> {
  const data = JSON.parse(
    readFileSync(join(SEED_DIR, 'mbti.json'), 'utf-8'),
  ) as SeedData;

  const fields = {
    name: data.test.name,
    description: data.test.description,
    category: data.test.category as unknown as TestCategory,
    scorerType: data.test.scorerType as unknown as ScorerType,
    price: data.test.price,
    estimatedDurationMin: data.test.estimatedDurationMin,
    timeLimitMin: data.test.timeLimitMin ?? null,
    status: 'PUBLISHED' as const,
  };

  const test = await prisma.test.upsert({
    where: { slug: data.test.slug },
    update: fields,
    create: { slug: data.test.slug, ...fields },
  });

  // Items: delete + create in one transaction so re-running the seed is
  // idempotent instead of stacking duplicate orders.
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

  const itemCount = await prisma.testItem.count({ where: { testId: test.id } });
  const interpCount = await prisma.interpretation.count({
    where: { testId: test.id },
  });
  console.log(
    `Seeded ${data.test.slug}: ${itemCount} items, ${interpCount} interpretations, status PUBLISHED`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
