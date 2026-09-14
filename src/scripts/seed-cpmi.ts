import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { TestCategory, ScorerType } from '../generated/prisma/enums';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type SeedData = {
  test: {
    slug: string;
    name: string;
    description: string;
    category: string;
    scorerType: string;
    price: number;
    estimatedDurationMin: number;
  };
  items: { order: number; content: unknown }[];
  interpretations: { patternCode: string; title: string; body: string }[];
};

async function main(): Promise<void> {
  const raw = readFileSync(
    join(__dirname, '../../prisma/seed-data/cpmi.json'),
    'utf-8',
  );
  const data = JSON.parse(raw) as SeedData;

  const test = await prisma.test.upsert({
    where: { slug: data.test.slug },
    update: {
      name: data.test.name,
      description: data.test.description,
      category: data.test.category as unknown as TestCategory,
      scorerType: data.test.scorerType as unknown as ScorerType,
      price: data.test.price,
      estimatedDurationMin: data.test.estimatedDurationMin,
      status: 'PUBLISHED',
    },
    create: {
      slug: data.test.slug,
      name: data.test.name,
      description: data.test.description,
      category: data.test.category as unknown as TestCategory,
      scorerType: data.test.scorerType as unknown as ScorerType,
      price: data.test.price,
      estimatedDurationMin: data.test.estimatedDurationMin,
      status: 'PUBLISHED',
    },
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

  const itemCount = await prisma.testItem.count({ where: { testId: test.id } });
  const interpCount = await prisma.interpretation.count({
    where: { testId: test.id },
  });
  console.log(
    `Seeded cpmi: ${itemCount} items, ${interpCount} interpretations, status PUBLISHED`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
